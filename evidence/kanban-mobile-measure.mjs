// Real-browser check for the kanban slice (T09): Requirements 10.1 to 10.7 and the journey of 10.8.
//
// Drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it
// needs no npm dependency. It uses Chrome's device emulation (not a real phone) and says so in the
// report. Playwright replaces it in T15. The stack must already be running: this script does not
// start Flask, Next.js or the database. It seeds its own throwaway data through the Flask API
// (two accounts, a board with three columns and four cards, and an empty board), so it needs no
// pre-made accounts.
//
//   BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 \
//   node evidence/kanban-mobile-measure.mjs > evidence/kanban-mobile.json
//
// Environment variables
//   BASE_URL      Next.js origin (required)
//   API_URL       Flask origin, used only to seed and to force a version conflict (required)
//   CHROME        path to the Chrome binary (optional; defaults to the macOS install)
//   REPORT_FILE   also write the JSON report to this path (optional)
//   SHOT_DIR      write PNG screenshots of the board at 375, 768 and 1280 px here (optional)
//
// Throwaway accounts use emails of the form kc-<hex>@kanban-check.example.test, so a cleanup can
// find them. The report never contains a password, an email, a board ID, a token or a cookie.
//
// Dialog safety: each dialog is opened to be measured, then closed with Cancel and again with
// Escape. While it closes, the script counts non-GET requests to /api/ and fails if any were sent.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9334;
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
const ADMIN = { email: `kc-admin-${SUFFIX}@kanban-check.example.test`, name: "Check Admin" };
const MEMBER = { email: `kc-member-${SUFFIX}@kanban-check.example.test`, name: "Check Member" };
const PASSWORD = `Aa1!${randomBytes(3).toString("hex")}`;
const SECRETS = [ADMIN.email, MEMBER.email, PASSWORD];

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
  const board = await api("POST", "/api/boards", ADMIN.token, { name: "Kanban check board" });
  await api("POST", `/api/boards/${board.id}/members`, ADMIN.token, { email: MEMBER.email });
  const members = await api("GET", `/api/boards/${board.id}/members`, ADMIN.token);
  MEMBER.id = members.find((m) => m.role === "member").user_id;
  const column = async (name, isDone = false) =>
    (await api("POST", `/api/boards/${board.id}/columns`, ADMIN.token, { name, is_done: isDone })).column;
  const todo = await column("To do");
  const doing = await column("In progress");
  const done = await column("Done", true);
  const addCard = async (columnId, title, assignee) =>
    (await api("POST", `/api/columns/${columnId}/cards`, ADMIN.token, { title, assignee_id: assignee ?? null })).card;
  const first = await addCard(todo.id, "Write spec", MEMBER.id);
  const second = await addCard(todo.id, "Review spec");
  const third = await addCard(todo.id, "Ship it");
  const fourth = await addCard(doing.id, "Deploy");
  const empty = await api("POST", "/api/boards", ADMIN.token, { name: "Kanban empty board" });
  await api("POST", `/api/boards/${empty.id}/members`, ADMIN.token, { email: MEMBER.email });
  return { board, empty, todo, doing, done, cards: { first, second, third, fourth } };
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
      `--user-data-dir=/tmp/revotask-kanban-chrome-${randomBytes(4).toString("hex")}`,
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
    // Enter needs its character for a focused button to activate, as in a real key press.
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
// Names are built from ids, aria labels or fixed text. Card and board names are throwaway.
function measureExpr(scopeSelector) {
  return `(() => {
    const scope = ${JSON.stringify(scopeSelector)} ? document.querySelector(${JSON.stringify(scopeSelector)}) : document;
    if (!scope) return { missing: true };
    const selector = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], summary';
    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const label = (el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'a') return 'a ' + new URL(el.href).pathname.replace(UUID, ':id');
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
        // A disabled button has pointer-events: none (daisyUI), so nothing can tap it and the hit
        // test would see the element underneath. Its size is still checked.
        hitOk: el.disabled ? true : !!hit && (hit === el || el.contains(hit)),
        fontSize: parseFloat(style.fontSize),
        isTextControl:
          (el.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'hidden'].includes(el.type)) ||
          el.tagName === 'SELECT' || el.tagName === 'TEXTAREA',
      });
    }
    window.scrollTo(0, 0);
    document.querySelectorAll('[aria-label="Kanban columns"]').forEach((r) => { r.scrollLeft = 0; });
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
const openerClick = (elementExpr) => `(() => {
  const b = ${elementExpr};
  if (!b) return false;
  window.__opener = b;
  b.focus();
  b.click();
  return true;
})()`;
const clickInDialog = (text) => `(() => {
  const d = document.querySelector('dialog[open]');
  const b = d && [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)});
  if (!b) return false;
  b.focus();
  b.click();
  return true;
})()`;
const clickByText = (text, root = "document") => `(() => {
  const b = [...${root}.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)} && !x.disabled);
  if (!b) return false;
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

async function openDialog(page, openerJs) {
  if (!(await page.eval(openerJs))) return false;
  if (!(await page.tryWait("!!document.querySelector('dialog[open]')"))) return false;
  if (!(await waitForDialogSettled(page))) record("harness", "dialog settle", 0, "dialog geometry settled within 3 s", false, "still changing");
  return true;
}

// Opens a dialog, measures it, checks focus, Tab containment, Cancel and Escape without a request,
// and focus return to the opener.
async function dialogChecks(role, page, width, label, openerJs) {
  const name = `${label} dialog`;
  if (!(await openDialog(page, openerJs))) {
    record(role, name, width, "dialog opens from its control", false, "opener or dialog not found");
    return;
  }
  reportPage(role, name, width, await page.eval(measureExpr("dialog[open]")));
  const inside = await page.eval(`(() => { const d = document.querySelector('dialog[open]'); return !!d && d.contains(document.activeElement); })()`);
  record(role, name, width, "focus moves into the dialog", inside);

  const trapped = [];
  for (let i = 0; i < 8; i += 1) {
    await page.press("Tab", "Tab", 9);
    trapped.push(await page.eval(`(() => { const d = document.querySelector('dialog[open]'); return !!d && d.contains(document.activeElement); })()`));
  }
  record(role, name, width, "Tab keeps focus inside the dialog (8 presses)", trapped.every(Boolean));

  const beforeCancel = page.mutations();
  await page.eval(clickInDialog("Cancel"));
  record(role, name, width, "Cancel closes the dialog", await page.tryWait("!document.querySelector('dialog[open]')"));
  await sleep(300);
  record(role, name, width, "Cancel sends no request to /api/", page.mutations() === beforeCancel, `${page.mutations() - beforeCancel} requests`);
  record(role, name, width, "focus returns to the opener after Cancel", await page.eval("document.activeElement === window.__opener"));

  if (!(await openDialog(page, openerJs))) {
    record(role, name, width, "dialog reopens for the Escape check", false);
    return;
  }
  const beforeEscape = page.mutations();
  await page.press("Escape", "Escape", 27);
  record(role, name, width, "Escape closes the dialog", await page.tryWait("!document.querySelector('dialog[open]')"));
  await sleep(300);
  record(role, name, width, "Escape sends no request to /api/", page.mutations() === beforeEscape, `${page.mutations() - beforeEscape} requests`);
  record(role, name, width, "focus returns to the opener after Escape", await page.eval("document.activeElement === window.__opener"));
}

const BOARD = (id) => `${ORIGIN}/boards/${id}`;
const REGION = `document.querySelector('[aria-label="Kanban columns"]')`;

async function boardChecks(role, page, width, ids) {
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!${REGION}`, "kanban region");
  reportPage(role, "board with columns and cards", width, await page.eval(measureExpr(null)));

  const region = await page.eval(`(() => {
    const r = ${REGION};
    return { named: r.getAttribute('aria-label'), tabindex: r.getAttribute('tabindex'), overflowX: getComputedStyle(r).overflowX,
             scrolls: r.scrollWidth > r.clientWidth, lanes: r.querySelectorAll('section').length };
  })()`);
  record(role, "board", width, "the Kanban region is focusable, named and scrolls sideways only inside itself", region.tabindex === "0" && region.overflowX === "auto", JSON.stringify(region));
  if (width <= 375) {
    record(role, "board", width, "the three lanes overflow the region at phone width", region.scrolls, `${region.lanes} lanes`);
    const moved = await page.eval(`(async () => {
      const r = ${REGION};
      r.scrollLeft = 0;
      r.focus();
      return true;
    })()`);
    await page.press("ArrowRight", "ArrowRight", 39);
    await page.press("ArrowRight", "ArrowRight", 39);
    await sleep(200);
    const left = await page.eval(`${REGION}.scrollLeft`);
    record(role, "board", width, "ArrowRight scrolls the focused region (keyboard scroll)", moved && left > 0, `scrollLeft ${left}`);
    await page.eval(`${REGION}.scrollLeft = 0`);
  }

  const controls = await page.eval(`({
    edit: !!${byLabel("Edit column To do")}, remove: !!${byLabel("Delete column To do")},
    left: !!${byLabel("Move In progress left")}, right: !!${byLabel("Move In progress right")},
    move: !!${byLabel("Move Write spec")}, addColumn: !!document.querySelector('form[aria-label="Add column"]'),
    addCard: !!document.querySelector('form[aria-label="Add card to To do"]')
  })`);
  const admin = role === "admin";
  record(role, "board", width, `column controls ${admin ? "shown" : "hidden"} for ${role}`, controls.edit === admin && controls.remove === admin && controls.left === admin && controls.right === admin && controls.addColumn === admin, JSON.stringify(controls));
  record(role, "board", width, "card controls and the visible Move button shown", controls.move && controls.addCard);

  // Dialogs available to both roles.
  await dialogChecks(role, page, width, "Move card", openerClick(byLabel("Move Write spec")));
  await dialogChecks(role, page, width, "Card details", openerClick(byLabel("Open Write spec")));
  if (admin) {
    await dialogChecks(role, page, width, "Edit column", openerClick(byLabel("Edit column To do")));
    await dialogChecks(role, page, width, "Delete column confirm", openerClick(byLabel("Delete column Done")));
    // The card delete confirm opens from inside the edit dialog.
    await page.eval(openerClick(byLabel("Open Write spec")));
    await page.tryWait("!!document.querySelector('dialog[open]')");
    await waitForDialogSettled(page);
    await page.eval(`(() => { const d = document.querySelector('dialog[open]'); const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete card'); window.__opener = b; b.focus(); b.click(); })()`);
    await sleep(500);
    await waitForDialogSettled(page);
    const dialogs = await page.eval(`document.querySelectorAll('dialog[open]').length`);
    record(role, "Delete card confirm", width, "the confirm opens above the edit dialog", dialogs === 2, `${dialogs} open dialogs`);
    reportPage(role, "Delete card confirm dialog", width, await page.eval(measureExpr("dialog[open]:last-of-type")));
    const before = page.mutations();
    await page.eval(`(() => { const ds = [...document.querySelectorAll('dialog[open]')]; const d = ds[ds.length - 1]; [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Cancel').click(); })()`);
    await sleep(400);
    await page.press("Escape", "Escape", 27);
    await sleep(400);
    record(role, "Delete card confirm", width, "Cancel and Escape send no request", page.mutations() === before);
  }
}

async function emptyBoardChecks(role, page, width, ids) {
  await page.goto(BOARD(ids.empty.id));
  await page.waitFor("document.body.innerText.includes('Columns')", "empty board");
  reportPage(role, "empty board", width, await page.eval(measureExpr(null)));
  const text = await page.eval("document.body.innerText");
  if (role === "admin") record(role, "empty board", width, "admin sees Add your first column and the form", text.includes("Add your first column") && !!(await page.eval(`!!document.querySelector('form[aria-label="Add column"]')`)));
  else record(role, "empty board", width, "member sees the message and no card or column form", text.includes("This board has no columns yet") && !(await page.eval(`!!document.querySelector('form')`)));
}

// ---- journey at 375 px ----------------------------------------------------------------------
async function journey(page, ids) {
  const R = "admin";
  const W = 375;
  await page.resize(W);
  await login(page, ADMIN.email);
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!${REGION}`, "board");

  // 1 add a column
  await page.eval(setValue("#add-column-name", "Review"));
  await page.eval(`document.querySelector('form[aria-label="Add column"]').requestSubmit()`);
  record(R, "journey", W, "add column: the new lane appears without a reload", await page.tryWait(`!!document.querySelector('section[aria-labelledby] h3') && [...document.querySelectorAll('h3')].some((h) => h.textContent === 'Review')`));

  // 2 add a card to the new column
  const formSel = 'form[aria-label="Add card to Review"]';
  await page.waitFor(`!!document.querySelector('${formSel}')`, "add-card form");
  await page.eval(setValue(`${formSel} input`, "Journey card"));
  await page.eval(`document.querySelector('${formSel}').requestSubmit()`);
  record(R, "journey", W, "add card: the card appears in the new column", await page.tryWait(`!!${byLabel("Open Journey card")}`));

  // 3 edit and assign
  await page.eval(openerClick(byLabel("Open Journey card")));
  await page.tryWait("!!document.querySelector('dialog[open]')");
  await waitForDialogSettled(page);
  await page.eval(setValue("#edit-card-title", "Journey card edited"));
  await page.eval(setValue("#edit-card-assignee", MEMBER.id));
  await page.eval(clickInDialog("Save card"));
  record(R, "journey", W, "edit and assign: the card shows the new title and the assignee", await page.tryWait(`!!${byLabel("Open Journey card edited")} && document.body.innerText.includes(${JSON.stringify(MEMBER.name)})`));

  // 4 move with the Move dialog (the touch path) to another column
  await page.eval(openerClick(byLabel("Move Journey card edited")));
  await page.tryWait("!!document.querySelector('dialog[open]')");
  await waitForDialogSettled(page);
  const optionValue = await page.eval(`[...document.querySelectorAll('#move-card-column option')].find((o) => o.textContent === 'In progress').value`);
  await page.eval(setValue("#move-card-column", optionValue));
  await page.eval(clickInDialog("Move card"));
  const movedOk = await page.tryWait(`(() => { const lane = [...document.querySelectorAll('section[aria-labelledby]')].find((s) => s.querySelector('h3')?.textContent === 'In progress'); return !!lane && lane.innerText.includes('Journey card edited'); })()`);
  record(R, "journey", W, "Move dialog: the card lands in In progress", movedOk);
  // The card shows in the new lane at once (optimistic), and the live region is set when the
  // server answers, so wait for the text.
  record(R, "journey", W, "move is announced in the live region", await page.tryWait(`document.querySelector('p[role=status]').textContent.startsWith("Moved Journey card edited to In progress")`, 6000));

  // 5 reload: the position persisted
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!${REGION}`, "board after reload");
  record(R, "journey", W, "reload: the card is still in In progress", await page.eval(`(() => { const lane = [...document.querySelectorAll('section[aria-labelledby]')].find((s) => s.querySelector('h3')?.textContent === 'In progress'); return !!lane && lane.innerText.includes('Journey card edited'); })()`));

  // 6 force a 409: change the board through the API, then move in the stale page
  const detail = await api("GET", `/api/boards/${ids.board.id}`, ADMIN.token);
  await api("PATCH", `/api/cards/${ids.cards.third.id}/position`, ADMIN.token, {
    column_id: ids.doing.id,
    before_card_id: null,
    expected_position_version: detail.position_version,
  });
  await page.eval(openerClick(byLabel("Move Write spec")));
  await page.tryWait("!!document.querySelector('dialog[open]')");
  await waitForDialogSettled(page);
  const col2 = await page.eval(`[...document.querySelectorAll('#move-card-column option')].find((o) => o.textContent === 'In progress').value`);
  await page.eval(setValue("#move-card-column", col2));
  await page.eval(clickInDialog("Move card"));
  const toast = await page.tryWait(`document.body.innerText.includes('The board changed. It has been refreshed.')`, 6000);
  record(R, "journey", W, "stale version: the 409 shows the board-changed message", toast);
  const refreshed = await page.tryWait(`(() => { const lane = [...document.querySelectorAll('section[aria-labelledby]')].find((s) => s.querySelector('h3')?.textContent === 'In progress'); return !!lane && lane.innerText.includes('Ship it'); })()`);
  record(R, "journey", W, "stale version: the board refetched and shows the other change", refreshed);
  record(R, "journey", W, "after the refetch the region is no longer busy", await page.tryWait(`${REGION}.getAttribute('aria-busy') === 'false'`));

  // 7 keyboard-only Move: tab to the Move button, open it with Enter, change a select with the keyboard
  await page.eval(`window.__opener = ${byLabel("Move Review spec")}; window.__opener.focus();`);
  await page.press("Enter", "Enter", 13);
  record(R, "journey", W, "keyboard: Enter on the Move button opens the dialog", await page.tryWait("!!document.querySelector('dialog[open]')"));
  await waitForDialogSettled(page);
  await page.press("Escape", "Escape", 27);
  record(R, "journey", W, "keyboard: Escape closes it and focus returns to the Move button", (await page.tryWait("!document.querySelector('dialog[open]')")) && (await page.eval("document.activeElement === window.__opener")));

  // 8 delete the journey card
  await page.eval(openerClick(byLabel("Open Journey card edited")));
  await page.tryWait("!!document.querySelector('dialog[open]')");
  await waitForDialogSettled(page);
  await page.eval(clickInDialog("Delete card"));
  await sleep(500);
  await waitForDialogSettled(page);
  await page.eval(`(() => { const ds = [...document.querySelectorAll('dialog[open]')]; const d = ds[ds.length - 1]; [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete card').click(); })()`);
  record(R, "journey", W, "delete: the card is removed", await page.tryWait(`!${byLabel("Open Journey card edited")}`));
}

// ---- synthetic drag at 1280 px ---------------------------------------------------------------
// A real pointer drag needs Playwright (T15). This dispatches the same DOM drag events the browser
// fires, with a real DataTransfer, on the real page and against the real server.
async function dragCheck(page, ids) {
  const R = "admin";
  const W = 1280;
  await page.resize(W);
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!${REGION}`, "board");
  const result = await page.eval(`(async () => {
    const card = document.querySelector('[data-testid^="card-"][draggable="true"]');
    const lanes = [...document.querySelectorAll('section[aria-labelledby]')];
    const target = lanes.find((s) => s.querySelector('h3')?.textContent === 'In progress').querySelector('[data-testid$="-end"]');
    const title = card.querySelector('button').getAttribute('aria-label');
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise((r) => setTimeout(r, 50));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return title;
  })()`);
  const moved = await page.tryWait(`(() => { const lane = [...document.querySelectorAll('section[aria-labelledby]')].find((s) => s.querySelector('h3')?.textContent === 'In progress'); return !!lane && lane.innerText.includes(${JSON.stringify(result.replace(/^Open /, ""))}); })()`, 6000);
  record(R, "drag (synthetic events)", W, "a drop on the end of In progress moves the card", moved);
  await page.goto(BOARD(ids.board.id));
  await page.waitFor(`!!${REGION}`, "board after reload");
  record(R, "drag (synthetic events)", W, "reload: the dragged card is still in In progress", await page.eval(`(() => { const lane = [...document.querySelectorAll('section[aria-labelledby]')].find((s) => s.querySelector('h3')?.textContent === 'In progress'); return !!lane && lane.innerText.includes(${JSON.stringify(result.replace(/^Open /, ""))}); })()`));
}

async function main() {
  console.error("seeding throwaway data through the Flask API");
  const ids = await seed();
  const { chrome, cdp, version } = await launch();
  try {
    const page = await newPage(cdp);
    for (const role of ["admin", "member"]) {
      console.error(`role ${role}`);
      await login(page, role === "admin" ? ADMIN.email : MEMBER.email);
      for (const width of WIDTHS) {
        await page.resize(width);
        console.error(` width ${width}`);
        await boardChecks(role, page, width, ids);
        await emptyBoardChecks(role, page, width, ids);
        if (process.env.SHOT_DIR && SHOT_WIDTHS.includes(width)) {
          mkdirSync(process.env.SHOT_DIR, { recursive: true });
          await page.goto(BOARD(ids.board.id));
          await page.waitFor(`!!${REGION}`, "board for screenshot");
          await page.shot(`${process.env.SHOT_DIR}/kanban-${role}-${width}.png`);
        }
      }
    }
    await journey(page, ids);
    await dragCheck(page, ids);
  } finally {
    chrome.kill();
    await api("DELETE", `/api/boards/${ids.board.id}`, ADMIN.token).catch(() => {});
    await api("DELETE", `/api/boards/${ids.empty.id}`, ADMIN.token).catch(() => {});
  }
  const failed = results.filter((r) => !r.pass);
  const report = {
    slice: "kanban (T07-T09)",
    browser: version,
    mode: "headless Chrome with device emulation (not a real phone), touch emulation below 640 px",
    drag: "synthetic DOM drag events with a real DataTransfer, not a pointer drag (Playwright, T15)",
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
