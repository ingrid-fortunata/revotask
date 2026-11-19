// Real-browser check for the comments slice (T10): Requirements 8.1 to 8.7 and the journey of 8.9.
//
// Drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it
// needs no npm dependency. It uses Chrome's device emulation (not a real phone) and says so in the
// report. Playwright replaces it in T15. The stack must already be running: this script does not
// start Flask, Next.js or the database. It seeds its own throwaway data through the Flask API (two
// accounts, a board with a column, two cards and four comments, one of them edited), so it needs
// no pre-made accounts.
//
//   BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 \
//   node evidence/comments-mobile-measure.mjs > evidence/comments-mobile.json
//
// Environment variables
//   BASE_URL      Next.js origin (required)
//   API_URL       Flask origin, used only to seed (required)
//   CHROME        path to the Chrome binary (optional; defaults to the macOS install)
//   REPORT_FILE   also write the JSON report to this path (optional)
//   SHOT_DIR      write PNG screenshots of the open Card details dialog at 375, 768 and 1280 px here
//
// Throwaway accounts use emails of the form cc-<hex>@comments-check.example.test, so a cleanup can
// find them. The report never contains a password, an email, a board ID, a token or a cookie.
//
// Dialog safety: each dialog is opened to be measured, then closed with Cancel and again with
// Escape. While it closes, the script counts non-GET requests to /api/ and fails if any were sent.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9335;
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
const ADMIN = { email: `cc-admin-${SUFFIX}@comments-check.example.test`, name: "Check Admin" };
const MEMBER = { email: `cc-member-${SUFFIX}@comments-check.example.test`, name: "Check Member" };
const PASSWORD = `Aa1!${randomBytes(3).toString("hex")}`;
const SECRETS = [ADMIN.email, MEMBER.email, PASSWORD];
const LONG = `https://example.test/${"a".repeat(220)}`;
const MEMBER_COMMENTS = 3; // the member authored three comments, the admin one

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

async function seed() {
  for (const user of [ADMIN, MEMBER]) {
    await api("POST", "/api/auth/register", null, { name: user.name, email: user.email, password: PASSWORD });
    user.token = (await api("POST", "/api/auth/login", null, { email: user.email, password: PASSWORD })).access_token;
  }
  const board = await api("POST", "/api/boards", ADMIN.token, { name: "Comments check board" });
  await api("POST", `/api/boards/${board.id}/members`, ADMIN.token, { email: MEMBER.email });
  const column = (await api("POST", `/api/boards/${board.id}/columns`, ADMIN.token, { name: "To do" })).column;
  const card = async (title) => (await api("POST", `/api/columns/${column.id}/cards`, ADMIN.token, { title })).card;
  const busy = await card("Write spec");
  const plain = await card("Plain card");
  const comment = (token, content) => api("POST", `/api/cards/${busy.id}/comments`, token, { content });
  const first = await comment(MEMBER.token, "First comment from the author");
  await comment(MEMBER.token, "Line one\nLine two\nLine three");
  await comment(MEMBER.token, LONG);
  await comment(ADMIN.token, "A comment from the admin");
  await api("PATCH", `/api/comments/${first.id}`, MEMBER.token, { content: "First comment from the author (edited)" });
  return { board, busy, plain };
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
      `--user-data-dir=/tmp/revotask-comments-chrome-${randomBytes(4).toString("hex")}`,
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
    await sleep(300); // hydration
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
    const text = key === "Enter" ? "\r" : undefined;
    for (const type of ["keyDown", "keyUp"]) {
      await this.send("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode: vk,
        ...(type === "keyDown" && text ? { text } : {}),
      });
    }
  }
  // Non-GET requests to the browser API routes this page has started so far.
  mutations() {
    return this.cdp.requests.filter(
      (r) => r.sessionId === this.sessionId && r.method !== "GET" && r.url.includes("/api/"),
    ).length;
  }
  commentPosts() {
    return this.cdp.requests.filter(
      (r) => r.sessionId === this.sessionId && r.method === "POST" && /\/api\/cards\/[^/]+\/comments$/.test(new URL(r.url).pathname),
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
      if (el.id) return tag + '#' + el.id;
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
        fontSize: parseFloat(style.fontSize),
        isTextControl:
          (el.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'hidden'].includes(el.type)) ||
          el.tagName === 'SELECT' || el.tagName === 'TEXTAREA',
      });
    }
    window.scrollTo(0, 0);
    const box = scope.querySelector && scope.querySelector('.modal-box');
    if (box) box.scrollTop = 0;
    return { docScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth, controls };
  })()`;
}

function reportPage(role, page, width, m) {
  if (m.missing) {
    record(role, page, width, "measured scope is present", false, "dialog not open");
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
  const text = m.controls.filter((c) => c.isTextControl);
  if (text.length > 0) {
    const tooSmall = text.filter((c) => c.fontSize < 16);
    record(
      role,
      page,
      width,
      "every text input, select and textarea computes to at least 16px",
      tooSmall.length === 0,
      tooSmall.length > 0 ? tooSmall.map((c) => `${c.name} ${c.fontSize}px`).join("; ") : `${text.length} controls`,
    );
  }
}

// ---- actions -------------------------------------------------------------------------------
const byLabel = (label) => `document.querySelector('button[aria-label=${JSON.stringify(label)}]')`;
const byLabelStart = (prefix, root = "document") => `${root}.querySelector('button[aria-label^=${JSON.stringify(prefix)}]')`;
const openerClick = (elementExpr) => `(() => {
  const b = ${elementExpr};
  if (!b) return false;
  window.__opener = b;
  b.focus();
  b.click();
  return true;
})()`;
const clickInDialog = (text, which = "first") => `(() => {
  const ds = [...document.querySelectorAll('dialog[open]')];
  const d = ${which === "last" ? "ds[ds.length - 1]" : "ds[0]"};
  const b = d && [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)} && !x.disabled);
  if (!b) return false;
  b.focus();
  b.click();
  return true;
})()`;
const setValue = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return true;
})()`;
const DIALOG = `document.querySelector('dialog[open]')`;
const COMMENT_TEXTS = `[...document.querySelectorAll('dialog[open] li p')].map((p) => p.textContent)`;

async function login(page, email) {
  await page.send("Network.clearBrowserCookies");
  await page.goto(`${ORIGIN}/login`);
  await page.type("#login-email", email);
  await page.type("#login-password", PASSWORD);
  await page.eval("document.querySelector('form').requestSubmit()");
  await page.waitFor("location.pathname === '/' && document.body.innerText.includes('Sign out')", "signed-in dashboard");
}

const DIALOG_GEOMETRY = `(() => {
  const d = document.querySelector('dialog[open]');
  if (!d) return null;
  const box = d.querySelector('.modal-box') || d;
  const scale = getComputedStyle(box).scale;
  const rects = [box, ...d.querySelectorAll('button, input, select, textarea')].map((el) => {
    const r = el.getBoundingClientRect();
    return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
  });
  return JSON.stringify({ scale, rects });
})()`;

async function waitForDialogSettled(page, timeoutMs = 3000, stableSamples = 3) {
  const end = Date.now() + timeoutMs;
  let last = null;
  let stable = 0;
  while (Date.now() < end) {
    let sample = null;
    try {
      sample = await page.eval(DIALOG_GEOMETRY);
    } catch {
      sample = null;
    }
    if (sample !== null) {
      const parsed = JSON.parse(sample);
      const settled = parsed.scale === "none" || parsed.scale === "1" || parsed.scale === "1 1";
      stable = sample === last && settled ? stable + 1 : 0;
      last = sample;
      if (stable >= stableSamples) return true;
    }
    await sleep(100);
  }
  return false;
}

const COMMENTS_LOADED = `!!document.querySelector('dialog[open] h3') && /^Comments( \\(\\d+\\))?$/.test(document.querySelector('dialog[open] h3').textContent.trim()) && document.querySelector('dialog[open] h3').textContent.includes('(')`;

async function openCardModal(page, title) {
  if (!(await page.eval(openerClick(byLabel(`Open ${title}`))))) return false;
  if (!(await page.tryWait(`!!${DIALOG}`))) return false;
  await page.tryWait(COMMENTS_LOADED, 6000);
  await waitForDialogSettled(page);
  return true;
}

async function closeCardModal(page) {
  await page.press("Escape", "Escape", 27);
  await page.tryWait(`!${DIALOG}`);
}

// The wide dialog (N3): its box fits the viewport, a long unbroken comment does not widen it, and
// the close control and the comment form are reachable inside the scrolling box (Requirement 8.2).
async function modalGeometry(role, page, width, name) {
  const g = await page.eval(`(() => {
    const d = ${DIALOG};
    const box = d.querySelector('.modal-box');
    box.scrollTop = 0;
    const close = d.querySelector('button[aria-label="Close card details"]');
    const cr = close.getBoundingClientRect();
    const closeVisible = cr.top >= 0 && cr.bottom <= window.innerHeight && cr.left >= 0 && cr.right <= window.innerWidth;
    const br = box.getBoundingClientRect();
    box.scrollTop = box.scrollHeight;
    const field = d.querySelector('#add-comment');
    const fr = field ? field.getBoundingClientRect() : null;
    const fieldVisible = !!fr && fr.top >= 0 && fr.bottom <= window.innerHeight;
    const overflowX = box.scrollWidth - box.clientWidth;
    const scrolls = box.scrollHeight > box.clientHeight;
    box.scrollTop = 0;
    return { boxWidth: Math.round(br.width), innerWidth: window.innerWidth, closeVisible, fieldVisible, overflowX, scrolls,
             zoomLocked: /user-scalable\\s*=\\s*(no|0)|maximum-scale\\s*=\\s*1(\\.0)?\\b/.test(document.querySelector('meta[name=viewport]')?.content ?? '') };
  })()`);
  record(role, name, width, "the wide dialog box is no wider than the viewport", g.boxWidth <= g.innerWidth, `box ${g.boxWidth}px, viewport ${g.innerWidth}px`);
  record(role, name, width, "nothing inside the dialog scrolls sideways (a long comment wraps)", g.overflowX <= 1, `overflow ${g.overflowX}px`);
  record(role, name, width, "the close control is reachable at the top of the dialog", g.closeVisible);
  record(role, name, width, "the comment field is reachable by scrolling inside the dialog", g.fieldVisible, g.scrolls ? "dialog scrolls inside itself" : "dialog fits without scrolling");
  record(role, name, width, "pinch zoom stays enabled", !g.zoomLocked);
}

// Opens a dialog, measures it, checks focus, Tab containment, Cancel and Escape without a request,
// and focus return to the opener. `closeText` is the control that closes it without a request.
async function dialogChecks(role, page, width, label, openerJs, closeText, last = false) {
  const name = `${label} dialog`;
  const sel = last ? "dialog[open]:last-of-type" : "dialog[open]";
  const open = async () => {
    if (!(await page.eval(openerJs))) return false;
    if (!(await page.tryWait(`!!${DIALOG}`))) return false;
    await page.tryWait(COMMENTS_LOADED, 6000);
    await sleep(300);
    await waitForDialogSettled(page);
    return true;
  };
  if (!(await open())) {
    record(role, name, width, "dialog opens from its control", false, "opener or dialog not found");
    return;
  }
  reportPage(role, name, width, await page.eval(measureExpr(sel)));
  if (!last) await modalGeometry(role, page, width, name);
  const insideExpr = `(() => { const ds = [...document.querySelectorAll('dialog[open]')]; const d = ds[ds.length - 1]; return !!d && d.contains(document.activeElement); })()`;
  record(role, name, width, "focus moves into the dialog", await page.eval(insideExpr));
  const trapped = [];
  for (let i = 0; i < 8; i += 1) {
    await page.press("Tab", "Tab", 9);
    trapped.push(await page.eval(insideExpr));
  }
  record(role, name, width, "Tab keeps focus inside the dialog (8 presses)", trapped.every(Boolean));

  const beforeCancel = page.mutations();
  await page.eval(clickInDialog(closeText, last ? "last" : "first"));
  record(role, name, width, `${closeText} closes the dialog`, await page.tryWait(last ? `document.querySelectorAll('dialog[open]').length === 1` : `!${DIALOG}`));
  await sleep(300);
  record(role, name, width, `${closeText} sends no request to /api/`, page.mutations() === beforeCancel, `${page.mutations() - beforeCancel} requests`);
  if (!last) record(role, name, width, `focus returns to the opener after ${closeText}`, await page.eval("document.activeElement === window.__opener"));

  if (!(await open())) {
    record(role, name, width, "dialog reopens for the Escape check", false);
    return;
  }
  const beforeEscape = page.mutations();
  await page.press("Escape", "Escape", 27);
  record(role, name, width, "Escape closes the dialog", await page.tryWait(last ? `document.querySelectorAll('dialog[open]').length === 1` : `!${DIALOG}`), `${await page.eval("document.querySelectorAll('dialog[open]').length")} dialogs open`);
  await sleep(300);
  record(role, name, width, "Escape sends no request to /api/", page.mutations() === beforeEscape, `${page.mutations() - beforeEscape} requests`);
  if (!last) record(role, name, width, "focus returns to the opener after Escape", await page.eval("document.activeElement === window.__opener"));
  if (last) await closeCardModal(page);
}

const BOARD = (id) => `${ORIGIN}/boards/${id}`;

async function widthChecks(role, page, width, ids) {
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!document.querySelector('[aria-label="Kanban columns"]')`, "kanban region");
  reportPage(role, "board", width, await page.eval(measureExpr(null)));
  record(role, "board", width, "every card shows an Open button named after its title", await page.eval(`!!${byLabel("Open Write spec")} && !!${byLabel("Open Plain card")}`));

  // Card details with comments: the list, the control counts per role, the long comment.
  await dialogChecks(role, page, width, "Card details (with comments)", openerClick(byLabel("Open Write spec")), "Cancel");
  await openCardModal(page, "Write spec");
  const state = await page.eval(`(() => {
    const d = ${DIALOG};
    const edit = d.querySelectorAll('button[aria-label^="Edit your comment from"]').length;
    const del = d.querySelectorAll('button[aria-label^="Delete your comment from"]').length;
    return { items: d.querySelectorAll('li').length, edit, del, edited: d.innerText.includes('Edited'),
             name: d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby')).textContent,
             lines: d.innerText.includes('Line one') && d.innerText.includes('Line three') };
  })()`);
  record(role, "Card details", width, "the dialog is named Card details and lists the four comments", state.name === "Card details" && state.items === 4, JSON.stringify({ name: state.name, items: state.items }));
  const mine = role === "member" ? MEMBER_COMMENTS : 1;
  record(role, "Card details", width, `Edit and Delete show only on the viewer's own comments (${mine})`, state.edit === mine && state.del === mine, `edit ${state.edit}, delete ${state.del}`);
  record(role, "Card details", width, "the edited comment shows the Edited text marker and a multi-line comment keeps its lines", state.edited && state.lines);
  if (process.env.SHOT_DIR && SHOT_WIDTHS.includes(width)) {
    mkdirSync(process.env.SHOT_DIR, { recursive: true });
    await page.shot(`${process.env.SHOT_DIR}/comments-${role}-${width}.png`);
    // The same dialog scrolled to its comments, which sit below the edit form on a phone.
    await page.eval(`(() => { const box = ${DIALOG}.querySelector('.modal-box'); box.scrollTop = ${DIALOG}.querySelector('h3').offsetTop - 16; })()`);
    await sleep(150);
    await page.shot(`${process.env.SHOT_DIR}/comments-${role}-${width}-list.png`);
  }
  await closeCardModal(page);

  // Empty card: the empty text and the add form.
  await dialogChecks(role, page, width, "Card details (no comments)", openerClick(byLabel("Open Plain card")), "Cancel");
  await openCardModal(page, "Plain card");
  record(role, "Card details (no comments)", width, "shows No comments yet. and the add form", await page.eval(`${DIALOG}.innerText.includes('No comments yet.') && !!${DIALOG}.querySelector('#add-comment')`));
  await closeCardModal(page);

  // The comment editor and the delete confirmation, on the viewer's own comment.
  await openCardModal(page, "Write spec");
  await page.eval(openerClick(byLabelStart("Edit your comment from", DIALOG)));
  await page.tryWait(`!!${DIALOG}.querySelector('textarea[id^="edit-comment-"]')`);
  reportPage(role, "comment editor", width, await page.eval(measureExpr("dialog[open]")));
  record(role, "comment editor", width, "focus moves into the editor field", await page.eval(`document.activeElement?.id?.startsWith('edit-comment-')`));
  const beforeCancel = page.mutations();
  // The card form also has a Cancel button, so click the one inside the comment editor.
  await page.eval(`[...${DIALOG}.querySelectorAll('form[aria-label^="Edit your comment from"] button')].find((b) => b.textContent.trim() === 'Cancel').click()`);
  record(role, "comment editor", width, "Cancel closes the editor, sends no request and returns focus to Edit", (await page.tryWait(`!${DIALOG}.querySelector('textarea[id^="edit-comment-"]')`)) && page.mutations() === beforeCancel && (await page.eval(`document.activeElement?.getAttribute('aria-label')?.startsWith('Edit your comment from')`)));
  await closeCardModal(page);

  await dialogChecksNested(role, page, width);
}

// The delete confirmation opens above the Card details dialog.
async function dialogChecksNested(role, page, width) {
  await openCardModal(page, "Write spec");
  const opener = openerClick(byLabelStart("Delete your comment from", DIALOG));
  await dialogChecks(role, page, width, "Delete comment confirm", opener, "Cancel", true);
}

// ---- journey at 375 px ----------------------------------------------------------------------
async function journey(page, ids) {
  const R = "member";
  const W = 375;
  await page.resize(W);
  await login(page, MEMBER.email);
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!document.querySelector('[aria-label="Kanban columns"]')`, "board");

  // 1 open the card and see the comments
  record(R, "journey", W, "open a card: Card details lists the four comments", (await openCardModal(page, "Write spec")) && (await page.eval(`${DIALOG}.querySelectorAll('li').length === 4`)));

  // 2 add a comment: it appears at the end, with no Edited marker
  await page.eval(setValue("#add-comment", "Journey comment\nsecond line"));
  await page.eval(`${DIALOG}.querySelector('form:has(#add-comment)').requestSubmit()`);
  const added = await page.tryWait(`${COMMENT_TEXTS}.includes('Journey comment\\nsecond line')`, 6000);
  record(R, "journey", W, "add a comment: it appears at the end of the list without a reload", added);
  record(R, "journey", W, "the new comment shows no Edited marker (N1)", await page.eval(`(() => { const li = [...${DIALOG}.querySelectorAll('li')].pop(); return !!li && li.innerText.includes('Journey comment') && !li.innerText.includes('Edited'); })()`));
  record(R, "journey", W, "the field is cleared and keeps focus after the add", await page.eval(`${DIALOG}.querySelector('#add-comment').value === '' && document.activeElement === ${DIALOG}.querySelector('#add-comment')`));

  // 3 edit it: the text changes and the Edited marker shows
  const lastEdit = `[...${DIALOG}.querySelectorAll('li')].pop().querySelector('button[aria-label^="Edit your comment from"]')`;
  await page.eval(openerClick(lastEdit));
  await page.tryWait(`!!${DIALOG}.querySelector('textarea[id^="edit-comment-"]')`);
  await page.eval(setValue('dialog[open] textarea[id^="edit-comment-"]', "Journey comment edited"));
  await page.eval(clickInDialog("Save comment"));
  record(R, "journey", W, "edit the comment: the new text shows with the Edited marker", await page.tryWait(`(() => { const li = [...${DIALOG}.querySelectorAll('li')].pop(); return li.innerText.includes('Journey comment edited') && li.innerText.includes('Edited'); })()`, 6000));

  // 4 delete it after confirming
  const lastDelete = `[...${DIALOG}.querySelectorAll('li')].pop().querySelector('button[aria-label^="Delete your comment from"]')`;
  await page.eval(openerClick(lastDelete));
  await page.tryWait(`document.querySelectorAll('dialog[open]').length === 2`);
  await waitForDialogSettled(page);
  await page.eval(clickInDialog("Delete comment", "last"));
  record(R, "journey", W, "delete the comment: it is removed from the list", await page.tryWait(`!${COMMENT_TEXTS}.includes('Journey comment edited') && ${DIALOG}.querySelectorAll('li').length === 4`, 6000));
  record(R, "journey", W, "after the delete, focus moves to the comment field", await page.tryWait(`document.activeElement === ${DIALOG}.querySelector('#add-comment')`));
  await closeCardModal(page);

  // 5 reload: the kept comments are still there, the deleted one is not
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!document.querySelector('[aria-label="Kanban columns"]')`, "board after reload");
  await openCardModal(page, "Write spec");
  record(R, "journey", W, "reload: the four kept comments are shown and the deleted one is gone", await page.eval(`${DIALOG}.querySelectorAll('li').length === 4 && !${DIALOG}.innerText.includes('Journey comment')`));
  await closeCardModal(page);

  // 6 an uncertain add against the real server: the comment is saved, then the response is lost
  const before = page.commentPosts();
  await openCardModal(page, "Write spec");
  await page.eval(`(() => {
    window.__realFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      const response = await window.__realFetch(input, init);
      if ((init?.method ?? 'GET') === 'POST' && /\\/api\\/cards\\/[^/]+\\/comments$/.test(new URL(url, location.href).pathname)) {
        window.fetch = window.__realFetch; // lose only this one response
        throw new TypeError('Failed to fetch');
      }
      return response;
    };
  })()`);
  await page.eval(setValue("#add-comment", "Saved but the answer was lost"));
  await page.eval(`${DIALOG}.querySelector('form:has(#add-comment)').requestSubmit()`);
  const review = await page.tryWait(`${DIALOG}.innerText.includes('may have been posted')`, 8000);
  record(R, "uncertain add", W, "a lost response shows that the comment may have been posted", review);
  const seen = await page.eval(`(() => ({
    once: ${COMMENT_TEXTS}.filter((t) => t === 'Saved but the answer was lost').length,
    draft: ${DIALOG}.querySelector('#add-comment').value,
    addEnabled: !!([...${DIALOG}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add comment') && ![...${DIALOG}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add comment').disabled),
  }))()`);
  record(R, "uncertain add", W, "the refreshed list shows the saved comment exactly once", seen.once === 1, `${seen.once} copies`);
  record(R, "uncertain add", W, "the draft is kept and Add comment is enabled again after the refresh", seen.draft === "Saved but the answer was lost" && seen.addEnabled);
  record(R, "uncertain add", W, "exactly one POST was sent, so there is no automatic retry", page.commentPosts() - before === 1, `${page.commentPosts() - before} POST`);
  reportPage(R, "uncertain add state", W, await page.eval(measureExpr("dialog[open]")));
  await modalGeometry(R, page, W, "uncertain add state");
  if (process.env.SHOT_DIR) {
    await page.eval(`(() => { const box = ${DIALOG}.querySelector('.modal-box'); box.scrollTop = box.scrollHeight; })()`);
    await sleep(150);
    await page.shot(`${process.env.SHOT_DIR}/comments-uncertain-add-375.png`);
  }
  // A manual retry posts again. No text matching hides it.
  await page.eval(clickInDialog("Add comment"));
  record(R, "uncertain add", W, "a manual retry posts a second comment with the same text", await page.tryWait(`${COMMENT_TEXTS}.filter((t) => t === 'Saved but the answer was lost').length === 2`, 6000) && page.commentPosts() - before === 2);
  await closeCardModal(page);

  // 7 a second user (the admin) sees the comments without controls on the member's comments
  await login(page, ADMIN.email);
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!document.querySelector('[aria-label="Kanban columns"]')`, "board as admin");
  await openCardModal(page, "Write spec");
  const second = await page.eval(`(() => {
    const items = [...${DIALOG}.querySelectorAll('li')];
    const memberItems = items.filter((li) => li.innerText.includes('Check Member'));
    return { items: items.length, memberItems: memberItems.length,
             memberControls: memberItems.reduce((n, li) => n + li.querySelectorAll('button').length, 0),
             ownControls: items.filter((li) => li.innerText.includes('Check Admin')).reduce((n, li) => n + li.querySelectorAll('button').length, 0) };
  })()`);
  record("admin", "journey", W, "a second user sees the member's comments and no Edit or Delete on them", second.memberItems >= 4 && second.memberControls === 0, `${second.memberItems} comments, ${second.memberControls} controls`);
  record("admin", "journey", W, "the admin has Edit and Delete only on their own comment", second.ownControls === 2, `${second.ownControls} controls`);
  await closeCardModal(page);
}

async function main() {
  console.error("seeding throwaway data through the Flask API");
  const ids = await seed();
  const { chrome, cdp, version } = await launch();
  try {
    const page = await newPage(cdp);
    for (const role of ["member", "admin"]) {
      console.error(`role ${role} (${role === "member" ? "author of three comments" : "not the author of the member's comments"})`);
      await login(page, role === "admin" ? ADMIN.email : MEMBER.email);
      for (const width of WIDTHS) {
        await page.resize(width);
        console.error(` width ${width}`);
        await widthChecks(role, page, width, ids);
      }
    }
    await journey(page, ids);
  } finally {
    chrome.kill();
    await api("DELETE", `/api/boards/${ids.board.id}`, ADMIN.token).catch(() => {});
  }
  const failed = results.filter((r) => !r.pass);
  const report = {
    slice: "comments (T10)",
    browser: version,
    mode: "headless Chrome with device emulation (not a real phone), touch emulation below 640 px",
    uncertainAdd: "the real server saves the comment and the page's fetch then rejects that one response, so the lost-response case runs against the real API",
    widths: WIDTHS,
    total: results.length,
    failed: failed.length,
    results,
  };
  const json = JSON.stringify(report, null, 2);
  for (const secret of SECRETS) {
    if (json.includes(secret)) {
      console.error("refusing to print a report that contains a secret");
      process.exit(3);
    }
  }
  if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, json);
  console.log(json);
  console.error(`${results.length} checks, ${failed.length} failed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`harness error: ${error.message}`);
  process.exit(4);
});
