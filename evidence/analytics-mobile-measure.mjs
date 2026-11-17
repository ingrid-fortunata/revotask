// Real-browser check for the analytics slice (T14): Requirements 6 and 7 (the header button, the modal
// dialog and its states, Refresh, failure isolation, mobile) and the manual journey of Requirement 7.5.
//
// Drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it
// needs no npm dependency. It uses Chrome's device emulation (not a real phone) and says so in the
// report. Playwright replaces it in T15. The stack must already be running: this script does not
// start Flask, Next.js or the database. It seeds its own throwaway accounts through the Flask API
// (an admin, a member and a user with no board), so it needs no pre-made accounts. The loading and
// error states are produced by holding or failing the analytics request in the browser (Fetch
// domain), so they need no server change.
//
//   BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 \
//   REPORT_FILE=evidence/analytics-mobile.json SHOT_DIR=evidence/analytics-screenshots \
//   node evidence/analytics-mobile-measure.mjs
//
// Environment variables
//   BASE_URL      Next.js origin (required)
//   API_URL       Flask origin, used only to seed and to read stored values (required)
//   CHROME        path to the Chrome binary (optional; defaults to the macOS install)
//   REPORT_FILE   also write the JSON report to this path (optional)
//   SHOT_DIR      write PNG screenshots at 375, 768 and 1280 px here (optional)
//
// Throwaway accounts use emails of the form an-<hex>@t14-check.example.test. The report never
// contains a password, an email, a token or a cookie. The accounts stay in the database that Flask
// uses (users cannot be deleted through the API), so run it against a test database.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9339;
const WIDTHS = [320, 375, 768, 1280];
const SHOT_WIDTHS = [375, 768, 1280];

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
const PASSWORD = `Aa1!${randomBytes(9).toString("hex")}`;
const ADMIN = { email: `an-admin-${SUFFIX}@t14-check.example.test`, name: "Check Admin" };
const MEMBER = { email: `an-member-${SUFFIX}@t14-check.example.test`, name: "M".repeat(60) };
const LONG_COLUMN = "C".repeat(60);

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
  for (const user of [ADMIN, MEMBER]) {
    await api("POST", "/api/auth/register", null, { name: user.name, email: user.email, password: PASSWORD });
  }
  world.admin = await login(ADMIN);
  world.member = await login(MEMBER);
  // The main board: three columns (one with a long unbroken name), Done, cards, events by two users.
  const board = await api("POST", "/api/boards", world.admin.token, { name: `Analytics check ${SUFFIX}` });
  world.board = board.id;
  await api("POST", `/api/boards/${board.id}/members`, world.admin.token, { email: MEMBER.email });
  const col = async (name, is_done = false) =>
    (await api("POST", `/api/boards/${board.id}/columns`, world.admin.token, { name, is_done })).column.id;
  world.todo = await col(LONG_COLUMN);
  world.doing = await col("Doing");
  world.done = await col("Done", true);
  const card = async (column, title, token = world.admin.token) =>
    (await api("POST", `/api/columns/${column}/cards`, token, { title })).card.id;
  world.cardA = await card(world.todo, "Write the report");
  world.cardB = await card(world.todo, "Plan the sprint", world.member.token);
  await card(world.doing, "Review the draft");
  await card(world.done, "Ship the release", world.member.token); // created in Done: completed + activity
  await api("POST", `/api/cards/${world.cardA}/comments`, world.member.token, { content: "Looks good." });
  // An empty board with columns and no cards, and a board with no columns at all.
  const quiet = await api("POST", "/api/boards", world.admin.token, { name: `Quiet check ${SUFFIX}` });
  world.quiet = quiet.id;
  await api("POST", `/api/boards/${quiet.id}/columns`, world.admin.token, { name: "Todo" });
  await api("POST", `/api/boards/${quiet.id}/columns`, world.admin.token, { name: "Done", is_done: true });
  const bare = await api("POST", "/api/boards", world.admin.token, { name: `Bare check ${SUFFIX}` });
  world.bare = bare.id;
}

async function stored(board = world.board) {
  return api("GET", `/api/boards/${board}/analytics`, world.admin.token);
}

// ---- minimal CDP client --------------------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.requests = [];
    this.paused = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "Fetch.requestPaused") {
        this.paused.push({ sessionId: msg.sessionId, requestId: msg.params.requestId, url: msg.params.request.url });
        return;
      }
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
      `--user-data-dir=/tmp/revotask-t14-chrome-${randomBytes(4).toString("hex")}`,
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
  // GET /api/boards/<id>/analytics requests this page has started so far.
  analyticsRequests() {
    return this.cdp.requests.filter(
      (r) => r.sessionId === this.sessionId && r.method === "GET" && /\/api\/boards\/[^/]+\/analytics$/.test(new URL(r.url).pathname),
    ).length;
  }
  // Hold every analytics request until release() or fail() is called (loading and error states).
  async holdAnalytics() {
    this.cdp.paused.length = 0;
    await this.send("Fetch.enable", { patterns: [{ urlPattern: "*/analytics", requestStage: "Request" }] });
  }
  async waitPaused() {
    for (let i = 0; i < 80; i += 1) {
      const hit = this.cdp.paused.find((p) => p.sessionId === this.sessionId);
      if (hit) return hit;
      await sleep(100);
    }
    throw new Error("no analytics request was held");
  }
  async release() {
    const hit = await this.waitPaused();
    this.cdp.paused.splice(this.cdp.paused.indexOf(hit), 1);
    await this.send("Fetch.continueRequest", { requestId: hit.requestId });
  }
  async fail() {
    const hit = await this.waitPaused();
    this.cdp.paused.splice(this.cdp.paused.indexOf(hit), 1);
    await this.send("Fetch.fulfillRequest", {
      requestId: hit.requestId,
      responseCode: 503,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Down.", request_id: "check" } })).toString("base64"),
    });
  }
  async stopHolding() {
    this.cdp.paused.length = 0;
    await this.send("Fetch.disable");
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


// ---- page helpers --------------------------------------------------------------------------
// The analytics figures live in a modal dialog opened by the "Analytics" button in the board header.
const DIALOG = 'dialog[open]';
const PANEL = DIALOG;
const ANALYTICS_BTN = `[...document.querySelectorAll('header button')].find((x) => x.textContent.trim() === 'Analytics')`;
const BOARD_REGION = `document.querySelector('[aria-label="Kanban columns"]')`;
const panelText = `(document.querySelector('${DIALOG}')?.innerText ?? '')`;

async function signIn(page, email) {
  await page.send("Network.clearBrowserCookies");
  await page.goto(`${ORIGIN}/login`);
  await page.type("#login-email", email);
  await page.type("#login-password", PASSWORD);
  await page.eval("document.querySelector('form').requestSubmit()");
  await page.waitFor("location.pathname === '/' && document.body.innerText.includes('Sign out')", "signed-in dashboard");
  await sleep(300);
}

async function openBoard(page, id) {
  await page.goto(`${ORIGIN}/boards/${id}`);
  await page.waitFor(`!!${ANALYTICS_BTN}`, "the Analytics button in the header");
}

// Opens the analytics dialog with the header button, the way a user does.
async function openAnalytics(page) {
  await page.eval(`(() => { const b = ${ANALYTICS_BTN}; b.focus(); b.click(); })()`);
  await page.waitFor(
    `!!document.querySelector('${DIALOG}') && document.querySelector('${DIALOG} h2')?.textContent === 'Analytics'`,
    "the analytics dialog",
  );
  await sleep(450); // the dialog's entry transition must finish before measuring
}

async function closeAnalytics(page) {
  await page.eval(`(() => { const d = document.querySelector('${DIALOG}'); [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Close').click(); })()`);
  await page.waitFor(`!document.querySelector('${DIALOG}')`, "the analytics dialog to close");
}

const figuresShown = (page) =>
  page.tryWait(`${panelText}.includes('Cards completed this week') && !${panelText}.includes('Loading analytics')`, 8000);

async function shot(page, shotDir, name, width) {
  if (shotDir && SHOT_WIDTHS.includes(width)) await page.shot(`${shotDir}/${name}-${width}.png`);
}

const columnCount = (name) =>
  `(() => { const li = [...document.querySelectorAll('${PANEL} section[aria-labelledby="analytics-columns-heading"] li')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(name)})); return li ? Number(li.innerText.trim().split(/\\s+/).pop()) : null; })()`;
const completed = `(() => { const el = document.querySelector('${PANEL} p.flex span.tabular-nums'); return el ? Number(el.innerText) : null; })()`;
const activityOf = (name) =>
  `(() => { const li = [...document.querySelectorAll('${PANEL} section[aria-labelledby="analytics-activity-heading"] li')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(name)})); return li ? Number(li.innerText.trim().split(/\\s+/).pop()) : null; })()`;

async function moveCard(page, title, columnName) {
  await page.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || x.textContent).trim() === ${JSON.stringify("Move " + title)}); b.focus(); b.click(); })()`);
  await page.waitFor("!!document.querySelector('dialog[open]')", "the move dialog");
  await sleep(450);
  await page.eval(`(() => { const d = document.querySelector('dialog[open]'); const s = d.querySelector('select#move-card-column'); const o = [...s.options].find((x) => x.textContent.trim() === ${JSON.stringify(columnName)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(100);
  await page.eval(`(() => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button[type=submit]')][0].click(); })()`);
  await page.waitFor("!document.querySelector('dialog[open]')", "the move dialog to close");
}

async function refresh(page) {
  await page.eval(`(() => { const b = [...document.querySelectorAll('${PANEL} button')].find((x) => x.textContent.trim() === 'Refresh'); b.focus(); b.click(); })()`);
}

// A keyboard press first, so a later focus() is a keyboard focus and shows the focus ring.
async function focusRing(page, expression) {
  await page.press("Shift", "ShiftLeft", 16);
  return page.eval(`(() => { const el = ${expression}; el.focus(); const s = getComputedStyle(el); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0; })()`);
}

const REFRESH_BTN = `[...document.querySelectorAll('${PANEL} button')].find((x) => x.textContent.trim() === 'Refresh')`;

// ---- scenarios -----------------------------------------------------------------------------
async function panelChecks(page, width, shotDir) {
  await page.resize(width);
  await signIn(page, ADMIN.email);
  await openBoard(page, world.board);

  // 0. Placement: the button is in the header, on the right of the title at 640 px and wider.
  const placement = await page.eval(`(() => {
    const h1 = document.querySelector('h1');
    const btn = ${ANALYTICS_BTN};
    const header = h1.closest('header');
    const rename = [...document.querySelectorAll('header button')].find((x) => x.textContent.trim() === 'Rename board');
    return {
      inHeader: !!btn && header.contains(btn),
      outsideTitleRow: !!btn && !h1.parentElement.contains(btn),
      rightOfTitle: !!btn && btn.getBoundingClientRect().left >= h1.getBoundingClientRect().right - 1,
      beforeRename: !rename || btn.compareDocumentPosition(rename) & Node.DOCUMENT_POSITION_FOLLOWING,
    };
  })()`);
  record("admin", "board header", width, "the Analytics button is in the header, outside the title row", placement.inHeader && placement.outsideTitleRow);
  record("admin", "board header", width, width >= 640 ? "the Analytics button is right of the board name" : "below 640 px the button stacks under the name", width < 640 || placement.rightOfTitle);
  record("admin", "board header", width, "the Analytics button comes before Rename board", Boolean(placement.beforeRename));
  reportPage("admin", "board header", width, await page.eval(measureExpr("header")));
  await shot(page, shotDir, "header-analytics", width);

  // 1. Loading: hold E29, open the dialog, look before it answers.
  const beforeOpen = page.analyticsRequests();
  await page.holdAnalytics();
  await openAnalytics(page);
  await page.waitPaused();
  record("admin", "dialog loading", width, "the dialog shows a loading state while E29 is held", (await page.eval(panelText)).includes("Loading analytics"));
  record("admin", "dialog loading", width, "exactly one read starts when the dialog opens", page.analyticsRequests() === beforeOpen + 1, `requests ${beforeOpen} -> ${page.analyticsRequests()}`);
  reportPage("admin", "dialog loading", width, await page.eval(measureExpr(DIALOG)));
  await shot(page, shotDir, "dialog-loading", width);
  await page.release();
  await page.stopHolding();

  // 2. Figures.
  record("admin", "dialog figures", width, "the figures appear after the read", await figuresShown(page));
  const text = await page.eval(panelText);
  record("admin", "dialog figures", width, "week range, completed figure, column list and activity list are text", /Week of \d+ \w+, \d\d:\d\d to \d+ \w+, \d\d:\d\d \(local time\)/.test(text) && text.includes("Cards completed this week") && text.includes("Cards per column") && text.includes("Activity this week"), text.split("\n").slice(0, 3).join(" | "));
  record("admin", "dialog figures", width, "no horizontal page scroll with the dialog open", await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`));
  reportPage("admin", "dialog figures", width, await page.eval(measureExpr(DIALOG)));
  record("admin", "dialog figures", width, "Refresh shows a visible focus ring for keyboard focus", await focusRing(page, REFRESH_BTN));
  await shot(page, shotDir, "dialog-figures", width);

  // 3. Failed refresh keeps the figures, shows the error and Retry.
  await page.holdAnalytics();
  await refresh(page);
  await page.waitPaused();
  record("admin", "dialog refresh", width, "a refresh keeps the figures and marks the dialog busy", (await page.eval(`document.querySelector('${DIALOG} [aria-busy]')?.getAttribute('aria-busy')`)) === "true" && (await page.eval(panelText)).includes("Cards completed this week"));
  await page.fail();
  await page.stopHolding();
  record("admin", "dialog error", width, "a failed read shows the error and a Retry button", await page.tryWait(`${panelText}.includes('Analytics could not be loaded.') && ${panelText}.includes('Retry')`));
  record("admin", "dialog error", width, "the last figures stay beside the error", (await page.eval(panelText)).includes("Cards completed this week"));
  record("admin", "dialog error", width, "the board behind the dialog shows no error", await page.eval(`!!${BOARD_REGION} && !${BOARD_REGION}.querySelector('[role=alert]')`));
  reportPage("admin", "dialog error", width, await page.eval(measureExpr(DIALOG)));
  await shot(page, shotDir, "dialog-error", width);
  await page.eval(`[...document.querySelectorAll('${DIALOG} button')].find((x) => x.textContent.trim() === 'Retry').click()`);
  record("admin", "dialog error", width, "Retry reads again and clears the error", await page.tryWait(`!${panelText}.includes('Analytics could not be loaded.')`));
  await closeAnalytics(page);

  // 4. Empty boards.
  await openBoard(page, world.quiet);
  await openAnalytics(page);
  record("admin", "empty board", width, "a board with columns and no cards shows zeros and the empty activity text", await page.tryWait(`${panelText}.includes('No activity this week.') && ${completed} === 0 && ${columnCount("Todo")} === 0`));
  reportPage("admin", "empty board", width, await page.eval(measureExpr(DIALOG)));
  await shot(page, shotDir, "dialog-empty", width);
  await closeAnalytics(page);
  await openBoard(page, world.bare);
  await openAnalytics(page);
  record("admin", "no columns", width, "a board with no columns shows 'No columns yet.' and 0 completed", await page.tryWait(`${panelText}.includes('No columns yet.') && ${completed} === 0`));
  reportPage("admin", "no columns", width, await page.eval(measureExpr(DIALOG)));
  await shot(page, shotDir, "dialog-no-columns", width);
  await closeAnalytics(page);
}

async function keyboardCheck(page, width) {
  await openBoard(page, world.board);
  await openAnalytics(page);
  await figuresShown(page);
  // Enter on a focused Refresh reads again.
  const before = page.analyticsRequests();
  await page.eval(`${REFRESH_BTN}.focus()`);
  for (const type of ["keyDown", "keyUp"]) {
    await page.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) });
  }
  await sleep(600);
  record("admin", "keyboard", width, "Enter on Refresh reads E29 again", page.analyticsRequests() === before + 1, `requests ${before} -> ${page.analyticsRequests()}`);
  // Escape closes the dialog and returns focus to the Analytics button.
  await page.press("Escape", "Escape", 27);
  const closed = await page.tryWait(`!document.querySelector('${DIALOG}')`, 3000);
  record("admin", "keyboard", width, "Escape closes the dialog", closed);
  record("admin", "keyboard", width, "focus returns to the Analytics button", closed && (await page.eval(`document.activeElement === ${ANALYTICS_BTN}`)));
}

async function journey(page) {
  console.error("\n== journey at 375px ==");
  await page.resize(375);
  await signIn(page, ADMIN.email);
  await openBoard(page, world.board);
  await openAnalytics(page);
  record("journey", "step 1", 375, "the figures appear on opening the dialog", await figuresShown(page));
  const start = { todo: await page.eval(columnCount(LONG_COLUMN)), done: await page.eval(columnCount("Done")), completed: await page.eval(completed) };
  const apiStart = await stored();
  record("journey", "step 1", 375, "the dialog matches the stored E29 values", start.completed === apiStart.completed_cards && start.todo === apiStart.cards_per_column[0].count, `completed ${start.completed}, todo ${start.todo}`);
  await closeAnalytics(page);

  // Step 2: complete a card with the board closed, then open again: a fresh read on open.
  await moveCard(page, "Write the report", "Done");
  const requests = page.analyticsRequests();
  await openAnalytics(page);
  record("journey", "step 2", 375, "opening the dialog after a move shows the new completed count", await page.tryWait(`${completed} === ${start.completed + 1}`, 6000), `completed ${start.completed} -> ${await page.eval(completed)}`);
  record("journey", "step 2", 375, "the reopen sent exactly one E29 read", page.analyticsRequests() === requests + 1, `requests ${requests} -> ${page.analyticsRequests()}`);
  record("journey", "step 2", 375, "the column counts changed with it", (await page.eval(columnCount(LONG_COLUMN))) === start.todo - 1 && (await page.eval(columnCount("Done"))) === start.done + 1);
  const adminBefore = await page.eval(activityOf(ADMIN.name));
  record("journey", "step 2", 375, "the admin's activity counts the move once", adminBefore === (apiStart.member_activity.find((m) => m.name === ADMIN.name)?.count ?? 0) + 1, `activity ${adminBefore}`);
  await closeAnalytics(page);

  // Step 3: with the dialog open, a comment by the second user shows only after Refresh (no polling).
  await openAnalytics(page);
  const memberBefore = await page.eval(activityOf(MEMBER.name));
  await api("POST", `/api/cards/${world.cardB}/comments`, world.member.token, { content: "Another note." });
  await sleep(1500);
  record("journey", "step 3", 375, "no new read happens by itself while open (no polling)", (await page.eval(activityOf(MEMBER.name))) === memberBefore);
  await refresh(page);
  record("journey", "step 3", 375, "Refresh shows the other user's new comment", await page.tryWait(`${activityOf(MEMBER.name)} === ${memberBefore + 1}`, 6000), `activity ${memberBefore} -> ${await page.eval(activityOf(MEMBER.name))}`);
  await closeAnalytics(page);

  // Step 4: remove the member; reopening keeps their activity under their name.
  await api("DELETE", `/api/boards/${world.board}/members/${world.member.id}`, world.admin.token);
  await openAnalytics(page);
  await sleep(500);
  record("journey", "step 4", 375, "after the member is removed their activity stays under their name", (await page.eval(activityOf(MEMBER.name))) === memberBefore + 1);
  await closeAnalytics(page);

  // Step 5: E29 fails; the dialog shows the error and a move still succeeds.
  await page.holdAnalytics();
  await openAnalytics(page);
  await page.waitPaused();
  await page.fail();
  await page.stopHolding();
  record("journey", "step 5", 375, "the dialog shows its error after the failed read", await page.tryWait(`${panelText}.includes('Analytics could not be loaded.')`));
  await closeAnalytics(page);
  await moveCard(page, "Plan the sprint", "Doing");
  const live = await api("GET", `/api/boards/${world.board}`, world.admin.token);
  const doingCards = live.columns.find((c) => c.name === "Doing").cards.map((c) => c.title);
  record("journey", "step 5", 375, "the move was stored although E29 failed", doingCards.includes("Plan the sprint"));
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
      console.error(`\n== ${width}px ==`);
      await panelChecks(page, width, shotDir);
      if (width === 320 || width === 375) await keyboardCheck(page, width);
    }
    await journey(page);
  } finally {
    chrome.kill();
  }
  const failed = results.filter((r) => !r.pass);
  const report = {
    slice: "analytics (T14)",
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
