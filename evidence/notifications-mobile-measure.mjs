// Real-browser check for the notifications slice (T13): Requirements 6 to 9 (bell, panel, polling,
// mobile) and the manual journey of Requirement 9.8, including removal and rejoin (Requirement 5.4, 5.5).
//
// Drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it
// needs no npm dependency. It uses Chrome's device emulation (not a real phone) and says so in the
// report. Playwright replaces it in T15. The stack must already be running: this script does not
// start Flask, Next.js or the database. It seeds its own throwaway accounts through the Flask API
// (three: the user under test, a second user who assigns and comments, and a user with no
// notification), so it needs no pre-made accounts.
//
//   BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 \
//   REPORT_FILE=evidence/notifications-mobile.json SHOT_DIR=evidence/notifications-screenshots \
//   node evidence/notifications-mobile-measure.mjs
//
// Environment variables
//   BASE_URL      Next.js origin (required)
//   API_URL       Flask origin, used only to seed and to read stored values (required)
//   CHROME        path to the Chrome binary (optional; defaults to the macOS install)
//   REPORT_FILE   also write the JSON report to this path (optional)
//   SHOT_DIR      write PNG screenshots at 375, 768 and 1280 px here (optional)
//
// Throwaway accounts use emails of the form nt-<hex>@t13-check.example.test. The report never
// contains a password, an email, a token or a cookie. The accounts stay in the database that Flask
// uses (users cannot be deleted through the API), so run it against a test database.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9338;
const WIDTHS = [320, 375, 768, 1280];
const SHOT_WIDTHS = [375, 768, 1280];
const POLL_WAIT_MS = 45_000; // the poll is 30 seconds, plus the request

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`missing environment variable: ${name}`);
    process.exit(2);
  }
  return new URL(value).origin;
}
const ORIGIN = required("BASE_URL");
const API = required("API_URL");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function record(role, page, width, check, pass, detail = "") {
  results.push({ role, page, width, check, pass: Boolean(pass), ...(detail ? { detail } : {}) });
  console.error(
    `  [${pass ? "PASS" : "FAIL"}] ${role} ${page}${width ? ` @${width}px` : ""}: ${check}${detail ? ` (${detail})` : ""}`,
  );
}

// ---- seed through the Flask API ------------------------------------------------------------
const SUFFIX = randomBytes(4).toString("hex");
const PASSWORD = `Aa1!${randomBytes(3).toString("hex")}`;
const ME = { email: `nt-me-${SUFFIX}@t13-check.example.test`, name: "Check Recipient" };
const OTHER = { email: `nt-other-${SUFFIX}@t13-check.example.test`, name: "Check Assigner" };
const EMPTY = { email: `nt-empty-${SUFFIX}@t13-check.example.test`, name: "Check Empty" };
const LONG_TITLE = "W".repeat(70);

async function api(method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")} -> ${response.status}`);
  return json?.data;
}

async function login(user) {
  const data = await api("POST", "/api/auth/login", null, { email: user.email, password: PASSWORD });
  return { token: data.access_token, id: data.user.id };
}

const world = {};

async function seed() {
  for (const user of [ME, OTHER, EMPTY]) {
    await api("POST", "/api/auth/register", null, { name: user.name, email: user.email, password: PASSWORD });
  }
  world.me = await login(ME);
  world.other = await login(OTHER);
  const board = await api("POST", "/api/boards", world.other.token, { name: `Notify check ${SUFFIX}` });
  world.board = board.id;
  await api("POST", `/api/boards/${board.id}/members`, world.other.token, { email: ME.email });
  const column = await api("POST", `/api/boards/${board.id}/columns`, world.other.token, { name: "Todo" });
  world.column = column.column.id;
  // Three notifications: a long unbroken title (assigned), a plain one (assigned), and a comment.
  await assignCard(LONG_TITLE);
  const second = await assignCard("Plan the sprint");
  await api("POST", `/api/cards/${second}/comments`, world.other.token, { content: "Please look at this." });
  world.commentedCard = second;
}

async function assignCard(title) {
  const created = await api("POST", `/api/columns/${world.column}/cards`, world.other.token, {
    title,
    assignee_id: world.me.id,
  });
  return created.card.id;
}

// What Flask stored for the recipient.
async function stored() {
  const data = await api("GET", "/api/notifications?page=1&per_page=1", world.me.token);
  return { total: data.total, unread: data.unread_count };
}

// ---- minimal CDP client --------------------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.requests = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "Network.requestWillBeSent") {
        this.requests.push({ sessionId: msg.sessionId, method: msg.params.request.method, url: msg.params.request.url });
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function launch() {
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=/tmp/revotask-t13-chrome-${randomBytes(4).toString("hex")}`,
      "--no-first-run",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let version;
  for (let i = 0; i < 50; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      break;
    } catch {
      await sleep(200);
    }
  }
  if (!version) throw new Error("Chrome did not start");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  return { chrome, cdp: new Cdp(ws), version: version.Browser };
}

class Page {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.sessionId = sessionId;
  }
  send(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "eval failed");
    return result.result.value;
  }
  async waitFor(expression, label, timeout = 12000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await this.eval(expression)) return true;
      } catch {
        // the page may be navigating
      }
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${label}`);
  }
  async tryWait(expression, timeout = 4000) {
    try {
      return await this.waitFor(expression, expression, timeout);
    } catch {
      return false;
    }
  }
  async goto(url) {
    await this.send("Page.navigate", { url });
    await sleep(150);
    await this.waitFor("document.readyState === 'complete'", `load ${url}`);
    await sleep(400); // hydration and the first E27 request
  }
  async resize(width) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: width < 640 ? 800 : 900,
      deviceScaleFactor: width < 640 ? 2 : 1,
      mobile: width < 640,
    });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: width < 640 });
  }
  async type(selector, text) {
    await this.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await this.send("Input.insertText", { text });
  }
  async press(key, code, vk) {
    for (const type of ["keyDown", "keyUp"]) {
      await this.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk });
    }
  }
  // GET /api/notifications requests this page has started so far.
  listRequests() {
    return this.cdp.requests.filter(
      (r) => r.sessionId === this.sessionId && r.method === "GET" && new URL(r.url).pathname === "/api/notifications",
    ).length;
  }
  async shot(file) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(data, "base64"));
  }
}

async function newPage(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const page = new Page(cdp, sessionId);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  return page;
}

// ---- measurements (run inside the page) ----------------------------------------------------
function measureExpr(scopeSelector) {
  return `(() => {
    const scope = ${JSON.stringify(scopeSelector)} ? document.querySelector(${JSON.stringify(scopeSelector)}) : document;
    if (!scope) return { missing: true };
    const selector = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], summary';
    const label = (el) => {
      const tag = el.tagName.toLowerCase();
      return tag + ' ' + ((el.getAttribute('aria-label') || el.textContent || '').trim()).slice(0, 40);
    };
    const controls = [];
    for (const el of scope.querySelectorAll(selector)) {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      controls.push({
        name: label(el),
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        hitOk: el.disabled ? true : !!hit && (hit === el || el.contains(hit)),
      });
    }
    window.scrollTo(0, 0);
    for (const box of document.querySelectorAll('.modal-box, .modal-box [class*=overflow-y-auto]')) box.scrollTop = 0;
    return { docScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth, controls };
  })()`;
}

function reportPage(role, page, width, m) {
  if (m.missing) {
    record(role, page, width, "measured scope is present", false, "scope not found");
    return;
  }
  record(role, page, width, "no horizontal page scroll (scrollWidth <= innerWidth)", m.docScroll <= m.innerWidth, `scrollWidth ${m.docScroll}, innerWidth ${m.innerWidth}`);
  const small = m.controls.filter((c) => c.width < 44 || c.height < 44);
  record(
    role,
    page,
    width,
    "every interactive box is at least 44x44 CSS px",
    m.controls.length > 0 && small.length === 0,
    small.length > 0 ? `too small: ${small.map((c) => `${c.name} ${c.width}x${c.height}`).join("; ")}` : `${m.controls.length} controls`,
  );
  const blocked = m.controls.filter((c) => !c.hitOk);
  record(role, page, width, "elementFromPoint at each control center returns the control", blocked.length === 0, blocked.map((c) => c.name).join("; "));
}

// The five header controls: reachable, and no two boxes overlap, and the content starts below the header.
const HEADER_LAYOUT = `(() => {
  const header = document.querySelector('header');
  const picks = {
    bell: header.querySelector('button[aria-haspopup="dialog"]'),
    profile: header.querySelector('a[href="/profile"]'),
    boards: header.querySelector('nav a[href="/"]'),
    tasks: header.querySelector('nav a[href="/my-tasks"]'),
    signout: [...header.querySelectorAll('button')].find((b) => /sign out/i.test(b.textContent)),
  };
  const boxes = {};
  for (const [key, el] of Object.entries(picks)) {
    if (!el) return { missing: key };
    const r = el.getBoundingClientRect();
    boxes[key] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  }
  const keys = Object.keys(boxes);
  const overlaps = [];
  for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) {
    const a = boxes[keys[i]], b = boxes[keys[j]];
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (x > 1 && y > 1) overlaps.push(keys[i] + '/' + keys[j]);
  }
  const main = document.querySelector('main');
  const hb = header.getBoundingClientRect();
  const sticky = getComputedStyle(header).position === 'sticky';
  const rows = new Set(keys.map((k) => Math.round(boxes[k].top))).size;
  return {
    overlaps,
    small: keys.filter((k) => boxes[k].w < 44 || boxes[k].h < 44).map((k) => k + ' ' + Math.round(boxes[k].w) + 'x' + Math.round(boxes[k].h)),
    belowHeader: !main || !sticky || main.getBoundingClientRect().top >= hb.bottom - 1,
    headerHeight: Math.round(hb.height),
    distinctTopEdges: rows,
    docScroll: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
})()`;

async function checkHeader(page, role, label, width) {
  const m = await page.eval(HEADER_LAYOUT);
  if (m.missing) {
    record(role, label, width, "all five header controls are present", false, `missing ${m.missing}`);
    return;
  }
  record(role, label, width, "bell, Profile, Boards, My tasks and Sign out are all present", true);
  record(role, label, width, "no two header controls overlap", m.overlaps.length === 0, m.overlaps.join(", "));
  record(role, label, width, "each header control is at least 44x44 CSS px", m.small.length === 0, m.small.join("; "));
  record(role, label, width, "the content below starts under the header (no overlap)", m.belowHeader, `header height ${m.headerHeight}px, ${m.distinctTopEdges} distinct top edges`);
  record(role, label, width, "no horizontal page scroll with the bell in the header", m.docScroll <= m.innerWidth, `scrollWidth ${m.docScroll}, innerWidth ${m.innerWidth}`);
}

// ---- page helpers --------------------------------------------------------------------------
const BELL = `document.querySelector('header button[aria-haspopup="dialog"]')`;
const DIALOG = `document.querySelector('dialog[open]')`;
const BADGE = `(${BELL}.textContent || '').trim()`;
const LABEL = `${BELL}.getAttribute('aria-label')`;

async function signIn(page, email) {
  await page.send("Network.clearBrowserCookies");
  await page.goto(`${ORIGIN}/login`);
  await page.type("#login-email", email);
  await page.type("#login-password", PASSWORD);
  await page.eval("document.querySelector('form').requestSubmit()");
  await page.waitFor("location.pathname === '/' && document.body.innerText.includes('Sign out')", "signed-in dashboard");
  await sleep(500); // the bell's first E27 request
}

// A user's click focuses the button, so the script does too: BaseModal returns focus to the opener.
async function clickBell(page) {
  await page.eval(`(() => { const b = ${BELL}; b.focus(); b.click(); })()`);
}

async function openPanel(page) {
  await clickBell(page);
  await page.waitFor(`!!${DIALOG}`, "the notifications dialog");
  await sleep(500); // the dialog's entry transition (scale or slide) must finish before measuring
}

async function waitRows(page) {
  await page.waitFor(`!!${DIALOG} && ${DIALOG}.querySelectorAll('li').length > 0`, "notification rows");
  await sleep(150);
}

async function closePanel(page) {
  await page.eval(`(() => { const d = ${DIALOG}; if (d) d.querySelector('button[aria-label="Close notifications"]').click(); })()`);
  await page.waitFor(`!${DIALOG}`, "the dialog to close");
}

async function shot(page, shotDir, name, width) {
  if (shotDir && SHOT_WIDTHS.includes(width)) await page.shot(`${shotDir}/${name}-${width}.png`);
}

const numberIn = (text) => Number((text.match(/\d+/) ?? ["0"])[0]);

// ---- scenarios -----------------------------------------------------------------------------
async function runWidthChecksA(page, width, shotDir) {
  // Recipient with three unread notifications: header with a count, the panel with rows, loading, error.
  await page.resize(width);
  await signIn(page, ME.email);
  await page.waitFor(`${BADGE} !== ''`, "a badge");
  record("recipient", "/", width, "the badge shows the unread count", (await page.eval(BADGE)) === "3", `badge ${await page.eval(BADGE)}`);
  record("recipient", "/", width, "the accessible name carries the exact count", (await page.eval(LABEL)) === "Notifications, 3 unread");
  await checkHeader(page, "recipient", "header with a count", width);
  await shot(page, shotDir, "header-count", width);

  // Loading state: slow the E27 request, open, and look before it answers.
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 2500, downloadThroughput: -1, uploadThroughput: -1 });
  await clickBell(page);
  await page.waitFor(`!!${DIALOG}`, "dialog (loading)");
  const loading = await page.tryWait(`!!${DIALOG} && ${DIALOG}.textContent.includes('Loading notifications')`, 2000);
  record("recipient", "panel loading", width, "the panel shows a loading state while E27 is slow", loading);
  await sleep(500);
  reportPage("recipient", "panel loading", width, await page.eval(measureExpr("dialog[open]")));
  await shot(page, shotDir, "panel-loading", width);
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitRows(page);

  const text = await page.eval(`${DIALOG}.innerText`);
  record("recipient", "panel list", width, "the panel lists assigned and commented rows with Unread text and the long unbroken title", /assigned you to/.test(text) && /commented on/.test(text) && /Unread/.test(text) && text.includes(LONG_TITLE));
  record("recipient", "panel list", width, "the panel names the dialog 'Notifications' and shows the counts", (await page.eval(`${DIALOG}.getAttribute('aria-labelledby') && document.getElementById(${DIALOG}.getAttribute('aria-labelledby')).textContent`)) === "Notifications" && /3 unread of 3/.test(text));
  reportPage("recipient", "panel list", width, await page.eval(measureExpr("dialog[open]")));
  const wrap = await page.eval(`(() => {
    const box = ${DIALOG}.querySelector('.modal-box');
    const boxOk = box.scrollWidth <= box.clientWidth + 1;
    // Every row link must hold its own text (no overflow) and must not run under the Unread badge.
    const bad = [];
    for (const li of ${DIALOG}.querySelectorAll('li')) {
      const link = li.querySelector('a');
      const badge = [...li.querySelectorAll('span')].find((n) => n.textContent.trim() === 'Unread');
      if (link.scrollWidth > link.clientWidth + 1) bad.push('overflow');
      if (badge) {
        const a = link.getBoundingClientRect(), b = badge.getBoundingClientRect();
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) bad.push('badge overlap');
      }
    }
    // The text color must be the dark body color, not the header's pale one.
    const color = getComputedStyle(${DIALOG}.querySelector('h2')).color;
    return { boxOk, bad, color };
  })()`);
  record("recipient", "panel list", width, "a long unbroken title wraps inside its row and does not widen the dialog", wrap.boxOk && wrap.bad.length === 0, wrap.bad.join(", "));
  const [red, green, blue] = (wrap.color.match(/\d+/g) ?? ["255", "255", "255"]).map(Number);
  record("recipient", "panel list", width, "the panel heading uses the dark body text color (readable on the white dialog)", (red + green + blue) / 3 < 100, wrap.color);
  await shot(page, shotDir, "panel-list", width);

  // Escape closes without a request and returns focus to the bell.
  const before = page.listRequests();
  await page.press("Escape", "Escape", 27);
  const closed = await page.tryWait(`!${DIALOG}`, 3000);
  record("recipient", "panel", width, "Escape closes the panel", closed);
  record("recipient", "panel", width, "focus returns to the bell", await page.eval(`document.activeElement === ${BELL}`));
  record("recipient", "panel", width, "Escape sends no notification request", page.listRequests() === before);

  // Error state: block E27, open, see the error and Retry, unblock, Retry.
  await page.send("Network.setBlockedURLs", { urls: ["*/api/notifications?page=*"] });
  await clickBell(page);
  await page.waitFor(`!!${DIALOG}`, "dialog (error)");
  const error = await page.tryWait(`!!${DIALOG} && ${DIALOG}.textContent.includes('could not be loaded')`, 6000);
  record("recipient", "panel error", width, "a failed E27 shows an error message with Retry", error);
  await sleep(500);
  reportPage("recipient", "panel error", width, await page.eval(measureExpr("dialog[open]")));
  await shot(page, shotDir, "panel-error", width);
  await page.send("Network.setBlockedURLs", { urls: [] });
  await page.eval(`[...${DIALOG}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Retry').click()`);
  await waitRows(page);
  record("recipient", "panel error", width, "Retry loads the rows", true);
  await closePanel(page);
}

async function runEmpty(page, width, shotDir) {
  await page.resize(width);
  await signIn(page, EMPTY.email);
  record("empty user", "/", width, "no badge and the plain name", (await page.eval(BADGE)) === "" && (await page.eval(LABEL)) === "Notifications");
  await checkHeader(page, "empty user", "header with no count", width);
  await shot(page, shotDir, "header-empty", width);
  await openPanel(page);
  await page.waitFor(`${DIALOG}.textContent.includes('You have no notifications')`, "empty state");
  record("empty user", "panel empty", width, "the panel shows the empty state", true);
  reportPage("empty user", "panel empty", width, await page.eval(measureExpr("dialog[open]")));
  await shot(page, shotDir, "panel-empty", width);
  await closePanel(page);
}

async function runKeyboard(page, width) {
  // Tab through the header controls in DOM order and check a visible focus ring on each. A fresh
  // load resets Chrome's sequential focus starting point to the top of the document.
  await page.goto(`${ORIGIN}/`);
  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    await page.press("Tab", "Tab", 9);
    const info = await page.eval(`(() => {
      const el = document.activeElement;
      if (!el || !el.closest('header')) return null;
      const cs = getComputedStyle(el);
      return { name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, visible: el.matches(':focus-visible') };
    })()`);
    if (info) seen.push(info);
    if (info && /sign out/i.test(info.name)) break;
  }
  const names = seen.map((s) => s.name);
  record("recipient", "header keyboard", width, "Tab reaches the bell, Boards, My tasks, Profile and Sign out", ["Notifications", "Boards", "My tasks", "Sign out", "RevoTask"].every((n) => names.some((x) => x.startsWith(n))) && names.some((x) => x.startsWith("Profile")), names.join(" | "));
  const noRing = seen.filter((s) => !s.ring || !s.visible).map((s) => s.name);
  record("recipient", "header keyboard", width, "every focused header control shows a visible focus ring", noRing.length === 0, noRing.join("; "));
}

async function journey(page) {
  // The manual journey of Requirement 9.8 at 375 px, with a second user.
  await page.resize(375);
  await signIn(page, ME.email);
  const start = await stored();
  record("journey", "/", 375, "the bell count equals the stored unread count", numberIn(await page.eval(LABEL)) === start.unread, `bell ${await page.eval(LABEL)}, stored ${start.unread}`);

  // Mark one read through the button.
  await openPanel(page);
  await waitRows(page);
  const marked = await page.eval(`(() => { const b = ${DIALOG}.querySelector('button[aria-label^="Mark as read:"]'); if (!b) return false; b.click(); return true; })()`);
  record("journey", "panel", 375, "an unread row has a Mark as read button", marked);
  await page.waitFor(`${LABEL} === 'Notifications, ${start.unread - 1} unread'`, "the count to drop by one");
  const afterMark = await stored();
  record("journey", "panel", 375, "marking read lowers the bell count and the stored count", afterMark.unread === start.unread - 1, `stored ${afterMark.unread}`);
  await closePanel(page);

  // Follow another unread row: it navigates to the board and the row is read.
  await openPanel(page);
  await waitRows(page);
  const followed = await page.eval(`(() => { const row = [...${DIALOG}.querySelectorAll('li')].find((li) => li.textContent.includes('Unread')); if (!row) return false; row.querySelector('a').click(); return true; })()`);
  record("journey", "panel", 375, "an unread row has a link", followed);
  await page.waitFor(`location.pathname === '/boards/${world.board}'`, "navigation to the board");
  record("journey", "link", 375, "following the link opens the board", true);
  await page.waitFor(`${LABEL} === 'Notifications, ${start.unread - 2} unread' || ${LABEL} === 'Notifications'`, "the followed row to be marked read", 8000).catch(() => {});
  const afterFollow = await stored();
  record("journey", "link", 375, "the followed row was marked read", afterFollow.unread === start.unread - 2, `stored ${afterFollow.unread}`);

  // Reload: the count shows the stored state.
  await page.goto(`${ORIGIN}/`);
  await page.waitFor(`${LABEL} !== null`, "the bell");
  await sleep(600);
  const reloaded = await stored();
  record("journey", "reload", 375, "after a reload the bell count equals the stored count", numberIn(await page.eval(LABEL)) === reloaded.unread || (reloaded.unread === 0 && (await page.eval(LABEL)) === "Notifications"), `bell ${await page.eval(LABEL)}, stored ${reloaded.unread}`);

  // The second user assigns 102 cards and comments: the bell updates within the poll.
  for (let i = 0; i < 102; i += 1) await assignCard(`Bulk card ${i + 1}`);
  await api("POST", `/api/cards/${world.commentedCard}/comments`, world.other.token, { content: "One more note." });
  const t0 = Date.now();
  const arrived = await page.tryWait(`${BADGE} === '99+'`, POLL_WAIT_MS);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const now = await stored();
  record("journey", "poll", 375, "the bell shows 99+ within one poll of the new notifications", arrived, `${elapsed}s after seeding`);
  record("journey", "poll", 375, "the accessible name keeps the exact count above 99", (await page.eval(LABEL)) === `Notifications, ${now.unread} unread`, `${await page.eval(LABEL)}`);
  return now;
}

async function runWidthChecksB(page, width, shotDir, total) {
  // Recipient with more than 99 unread: the 99+ badge and the last page.
  await page.resize(width);
  await signIn(page, ME.email);
  await page.waitFor(`${BADGE} !== ''`, "a badge");
  record("recipient", "/", width, "the badge caps at 99+", (await page.eval(BADGE)) === "99+");
  await checkHeader(page, "recipient", "header with 99+", width);
  await shot(page, shotDir, "header-99plus", width);
  await openPanel(page);
  await waitRows(page);
  const pages = Math.ceil(total / 20);
  record("recipient", "panel paging", width, "the panel shows 'Page 1 of n' and Older, with Newer disabled", (await page.eval(`${DIALOG}.innerText`)).includes(`Page 1 of ${pages}`) && (await page.eval(`[...${DIALOG}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Newer').disabled`)));
  for (let i = 1; i < pages; i += 1) {
    await page.eval(`[...${DIALOG}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Older').click()`);
    await page.waitFor(`${DIALOG}.innerText.includes('Page ${i + 1} of ${pages}')`, `page ${i + 1}`);
    await waitRows(page);
  }
  record("recipient", "panel last page", width, "on the last page Older is disabled and the rows show", await page.eval(`[...${DIALOG}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Older').disabled`));
  reportPage("recipient", "panel last page", width, await page.eval(measureExpr("dialog[open]")));
  await shot(page, shotDir, "panel-last-page", width);
  await closePanel(page);
}

async function removalAndRejoin(page) {
  // Removing the recipient hides the rows and the count; adding them back returns them with their read status.
  await page.resize(375);
  await signIn(page, ME.email);
  await page.waitFor(`${BADGE} !== ''`, "a badge");
  const before = await stored();
  await api("DELETE", `/api/boards/${world.board}/members/${world.me.id}`, world.other.token);
  const gone = await page.tryWait(`${LABEL} === 'Notifications'`, POLL_WAIT_MS);
  record("removal", "poll", 375, "after removal the bell count drops to none within one poll", gone);
  const hidden = await stored();
  record("removal", "api", 375, "after removal Flask returns no notification", hidden.total === 0 && hidden.unread === 0, `total ${hidden.total}`);
  await api("POST", `/api/boards/${world.board}/members`, world.other.token, { email: ME.email });
  const back = await page.tryWait(`${LABEL} === 'Notifications, ${before.unread} unread'`, POLL_WAIT_MS);
  record("rejoin", "poll", 375, "after the member is added again the same count returns within one poll", back, `expected ${before.unread}`);
  const after = await stored();
  record("rejoin", "api", 375, "after rejoining the stored counts match the earlier ones (read status kept)", after.total === before.total && after.unread === before.unread, `total ${after.total}, unread ${after.unread}`);
}

// ---- main ----------------------------------------------------------------------------------
async function main() {
  const shotDir = process.env.SHOT_DIR;
  if (shotDir) mkdirSync(shotDir, { recursive: true });
  console.error("seeding throwaway accounts through Flask");
  await seed();
  const { chrome, cdp, version } = await launch();
  const started = new Date().toISOString();
  try {
    const page = await newPage(cdp);
    for (const width of WIDTHS) {
      console.error(`\n== ${width}px (recipient with three unread) ==`);
      await runWidthChecksA(page, width, shotDir);
      if (width === 320 || width === 375) await runKeyboard(page, width);
      console.error(`== ${width}px (user with no notification) ==`);
      await runEmpty(page, width, shotDir);
    }
    console.error("\n== journey at 375px ==");
    const now = await journey(page);
    for (const width of WIDTHS) {
      console.error(`\n== ${width}px (99+ and the last page) ==`);
      await runWidthChecksB(page, width, shotDir, now.total);
    }
    console.error("\n== removal and rejoin ==");
    await removalAndRejoin(page);
  } finally {
    chrome.kill();
  }
  const failed = results.filter((r) => !r.pass);
  const report = {
    slice: "notifications (T13)",
    started,
    browser: version,
    device: "Chrome headless with device-metrics emulation (not a real phone)",
    widths: WIDTHS,
    checks: results.length,
    failed: failed.length,
    results,
  };
  if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n${results.length} checks, ${failed.length} failed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
