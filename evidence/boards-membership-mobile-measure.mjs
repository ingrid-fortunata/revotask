// Real-browser check for the boards-membership slice: BM1 (Requirements 6.1–6.5 and 3.10).
//
// Drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it
// needs no npm dependency. It uses Chrome's device emulation (not a real phone) and records that in
// the report. Playwright replaces it in T15. The stack must already be running (task 7.2 starts it
// by hand). This script does not start Flask, Next.js or the database.
//
//   BASE_URL=http://localhost:3100 \
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//   MEMBER_EMAIL=... MEMBER_PASSWORD=... \
//   BOARD_ID=<uuid> \
//   node evidence/boards-membership-mobile-measure.mjs > evidence/boards-membership-mobile.json
//
// Environment variables (all required unless noted)
//   BASE_URL          Next.js origin, for example http://localhost:3100
//   ADMIN_EMAIL       Admin of BOARD_ID
//   ADMIN_PASSWORD    password of ADMIN_EMAIL
//   MEMBER_EMAIL      active member with role member of BOARD_ID
//   MEMBER_PASSWORD   password of MEMBER_EMAIL
//   BOARD_ID          UUID of a board that ADMIN_EMAIL administers and MEMBER_EMAIL belongs to
//   CHROME            path to the Chrome binary (optional; defaults to the macOS install)
//   REPORT_FILE       also write the JSON report to this path (optional)
//
// Output: the JSON report goes to stdout. Progress lines go to stderr. The script never prints a
// password, an email address, the board ID, a token or a cookie. Board and member names are not
// printed either. Before printing, it refuses to output a report that contains any of those values.
//
// Confirm_Dialog safety: the script opens the delete-board and remove-member dialogs to measure them
// and to check focus. It closes each one with Cancel and then with Escape. It never presses the
// confirm button. While it closes a dialog, it counts non-GET requests to /api/boards and fails the
// check if any were sent.
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const WIDTHS = [320, 375, 768, 1280];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readEnv() {
  const names = [
    "BASE_URL",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "MEMBER_EMAIL",
    "MEMBER_PASSWORD",
    "BOARD_ID",
  ];
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`missing environment variables: ${missing.join(", ")}`);
    process.exit(2);
  }
  let origin;
  try {
    const url = new URL(process.env.BASE_URL.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error("protocol");
    origin = url.origin;
  } catch {
    console.error("BASE_URL must be an http or https URL");
    process.exit(2);
  }
  const boardId = process.env.BOARD_ID.trim();
  if (!UUID_PATTERN.test(boardId)) {
    console.error("BOARD_ID must be a UUID");
    process.exit(2);
  }
  return {
    origin,
    adminEmail: process.env.ADMIN_EMAIL.trim(),
    adminPassword: process.env.ADMIN_PASSWORD,
    memberEmail: process.env.MEMBER_EMAIL.trim(),
    memberPassword: process.env.MEMBER_PASSWORD,
    boardId,
  };
}

const ENV = readEnv();
const BOARD_URL = `${ENV.origin}/boards/${ENV.boardId}`;
// Values that must never appear in the printed report.
const SECRETS = [
  ENV.adminEmail,
  ENV.memberEmail,
  ENV.adminPassword,
  ENV.memberPassword,
  ENV.boardId,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function record(role, page, width, check, pass, detail = "") {
  results.push({
    role,
    page,
    width,
    check,
    pass: Boolean(pass),
    ...(detail ? { detail } : {}),
  });
  console.error(
    `  [${pass ? "PASS" : "FAIL"}] ${role} ${page}${width ? ` @${width}px` : ""}: ${check}${detail ? ` (${detail})` : ""}`,
  );
}

// ---- minimal CDP client -------------------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.requests = []; // every request the browser started: { sessionId, method, url }
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "Network.requestWillBeSent") {
        this.requests.push({
          sessionId: msg.sessionId,
          method: msg.params.request.method,
          url: msg.params.request.url,
        });
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
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
  }
}

async function launch() {
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=/tmp/revotask-chrome-${randomBytes(4).toString("hex")}`,
      "--no-first-run",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let version;
  for (let i = 0; i < 50; i += 1) {
    try {
      version = await (
        await fetch(`http://127.0.0.1:${PORT}/json/version`)
      ).json();
      break;
    } catch {
      await sleep(200);
    }
  }
  if (!version) throw new Error("Chrome did not start");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) =>
    ws.addEventListener("open", resolve, { once: true }),
  );
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
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ?? "eval failed",
      );
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
    await sleep(250); // hydration
  }
  async resize(width) {
    const height = width < 640 ? 800 : 900;
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: width < 640 ? 2 : 1,
      mobile: width < 640,
    });
    await this.send("Emulation.setTouchEmulationEnabled", {
      enabled: width < 640,
    });
  }
  async type(selector, text) {
    await this.eval(
      `document.querySelector(${JSON.stringify(selector)}).focus()`,
    );
    await this.send("Input.insertText", { text });
  }
  async press(key, code, vk) {
    for (const type of ["keyDown", "keyUp"]) {
      await this.send("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode: vk,
      });
    }
  }
  // Non-GET requests to the browser API routes that this page has started so far.
  mutations() {
    return this.cdp.requests.filter(
      (r) =>
        r.sessionId === this.sessionId &&
        r.method !== "GET" &&
        r.url.includes("/api/boards"),
    ).length;
  }
}

async function newPage(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = new Page(cdp, sessionId);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  return page;
}

// ---- measurements (run inside the page) ----------------------------------------------------
// scopeSelector: a CSS selector for the open dialog, or null to measure the whole document.
// Returns control names built from ids, input names, fixed labels or route templates. It never
// returns board names, member names or other user text.
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
      const aria = el.getAttribute('aria-label') || '';
      if (aria.startsWith('Remove ')) return tag + ' Remove member';
      if (el.getAttribute('name')) return tag + ' name=' + el.getAttribute('name');
      return tag + ' ' + (aria || (el.textContent || '').trim()).slice(0, 30);
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
        hitOk: !!hit && (hit === el || el.contains(hit)),
        fontSize: parseFloat(style.fontSize),
        isTextInput: el.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'hidden'].includes(el.type),
      });
    }
    window.scrollTo(0, 0);
    return { docScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth, controls };
  })()`;
}

function reportPage(role, page, width, m) {
  if (m.missing) {
    record(
      role,
      page,
      width,
      "measured scope is present",
      false,
      "dialog not open",
    );
    return;
  }
  record(
    role,
    page,
    width,
    "no horizontal page scroll (scrollWidth <= innerWidth)",
    m.docScroll <= m.innerWidth,
    `scrollWidth ${m.docScroll}, innerWidth ${m.innerWidth}`,
  );
  const small = m.controls.filter((c) => c.width < 44 || c.height < 44);
  record(
    role,
    page,
    width,
    "every interactive box is at least 44x44 CSS px",
    m.controls.length > 0 && small.length === 0,
    small.length > 0
      ? `too small: ${small.map((c) => `${c.name} ${c.width}x${c.height}`).join("; ")}`
      : `${m.controls.length} controls`,
  );
  const blocked = m.controls.filter((c) => !c.hitOk);
  record(
    role,
    page,
    width,
    "elementFromPoint at each control center returns the control",
    blocked.length === 0,
    blocked.map((c) => c.name).join("; "),
  );
  const inputs = m.controls.filter((c) => c.isTextInput);
  if (inputs.length > 0) {
    const tooSmall = inputs.filter((c) => c.fontSize < 16);
    record(
      role,
      page,
      width,
      "every text input computes to a font size of at least 16px",
      tooSmall.length === 0,
      tooSmall.length > 0
        ? tooSmall.map((c) => `${c.name} ${c.fontSize}px`).join("; ")
        : `${inputs.length} inputs`,
    );
  }
}

// ---- actions ------------------------------------------------------------------------------
const clickByText = (text) => `(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)});
  if (!b) return false;
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

// Records the opener so focus return can be checked later. The opener is focused first, the way a
// user who clicks or taps it leaves it focused.
const openerClick = (elementExpr) => `(() => {
  const b = ${elementExpr};
  if (!b) return false;
  window.__opener = b;
  b.focus();
  b.click();
  return true;
})()`;
const DELETE_OPENER = openerClick(
  `[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete board')`,
);
const REMOVE_OPENER = openerClick(
  `document.querySelector('button[aria-label^="Remove "]')`,
);

async function login(page, email, password) {
  await page.send("Network.clearBrowserCookies");
  await page.goto(`${ENV.origin}/login`);
  await page.type("#login-email", email);
  await page.type("#login-password", password);
  await page.eval("document.querySelector('form').requestSubmit()");
  await page.waitFor(
    "location.pathname === '/' && document.body.innerText.includes('Sign out')",
    "signed-in dashboard",
  );
}

// Geometry sample of the open dialog: the box and its buttons, plus the box scale.
// The dialog animates in (BaseModal, daisyUI scale and translate), so a fixed delay
// measures a transient. This waits for the dialog to be open and for the geometry to
// stop changing, with a hard upper bound.
const DIALOG_GEOMETRY = `(() => {
  const d = document.querySelector('dialog[open]');
  if (!d) return null;
  const box = d.querySelector('.modal-box') || d;
  const scale = getComputedStyle(box).scale;
  const rects = [box, ...d.querySelectorAll('button')].map((el) => {
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
  const opened = await page.tryWait("!!document.querySelector('dialog[open]')");
  if (!opened) return false;
  const settled = await waitForDialogSettled(page);
  if (!settled) {
    record("harness", "dialog settle", 0, "dialog geometry settled within 3 s", false, "geometry still changing");
  }
  return opened;
}

async function dialogChecks(role, page, width, label, openerJs) {
  const name = `${label} Confirm_Dialog`;
  if (!(await openDialog(page, openerJs))) {
    record(
      role,
      name,
      width,
      "dialog opens from its control",
      false,
      "opener or dialog not found",
    );
    return;
  }
  reportPage(role, name, width, await page.eval(measureExpr("dialog[open]")));

  const focus = await page.eval(`(() => {
    const d = document.querySelector('dialog[open]');
    const a = document.activeElement;
    return { inside: !!d && d.contains(a), text: a ? a.textContent.trim() : '' };
  })()`);
  record(
    role,
    name,
    width,
    "focus moves into the dialog and lands on Cancel",
    focus.inside && focus.text === "Cancel",
    `focused: ${focus.text || "none"}`,
  );

  const trapped = [];
  for (let i = 0; i < 6; i += 1) {
    await page.press("Tab", "Tab", 9);
    trapped.push(
      await page.eval(
        `(() => { const d = document.querySelector('dialog[open]'); return !!d && d.contains(document.activeElement); })()`,
      ),
    );
  }
  record(
    role,
    name,
    width,
    "Tab keeps focus inside the dialog (6 presses)",
    trapped.length === 6 && trapped.every(Boolean),
  );

  const beforeCancel = page.mutations();
  await page.eval(clickInDialog("Cancel"));
  const closedByCancel = await page.tryWait(
    "!document.querySelector('dialog[open]')",
  );
  await sleep(300);
  record(role, name, width, "Cancel closes the dialog", closedByCancel);
  record(
    role,
    name,
    width,
    "Cancel sends no request to /api/boards",
    page.mutations() === beforeCancel,
    `${page.mutations() - beforeCancel} requests`,
  );
  record(
    role,
    name,
    width,
    "focus returns to the opener after Cancel",
    await page.eval("document.activeElement === window.__opener"),
  );

  if (!(await openDialog(page, openerJs))) {
    record(role, name, width, "dialog reopens for the Escape check", false);
    return;
  }
  const beforeEscape = page.mutations();
  await page.press("Escape", "Escape", 27);
  const closedByEscape = await page.tryWait(
    "!document.querySelector('dialog[open]')",
  );
  await sleep(300);
  record(role, name, width, "Escape closes the dialog", closedByEscape);
  record(
    role,
    name,
    width,
    "Escape sends no request to /api/boards",
    page.mutations() === beforeEscape,
    `${page.mutations() - beforeEscape} requests`,
  );
  record(
    role,
    name,
    width,
    "focus returns to the opener after Escape",
    await page.eval("document.activeElement === window.__opener"),
  );
}

async function adminStates(page, role, width) {
  // Rename form: opened from the header, measured, then closed again without submitting.
  await page.eval(clickByText("Rename board"));
  if (await page.tryWait("!!document.getElementById('rename-board-name')")) {
    reportPage(
      role,
      "/boards/:id rename form",
      width,
      await page.eval(measureExpr(null)),
    );
  } else {
    record(role, "/boards/:id rename form", width, "rename form opens", false);
  }
  await page.eval(clickByText("Rename board"));
  await page.tryWait("!document.getElementById('rename-board-name')");

  // Not-found state: a random UUID that no board uses.
  await page.goto(`${ENV.origin}/boards/${randomUUID()}`);
  if (
    await page.tryWait(
      "document.body.innerText.includes('Board not found')",
      12000,
    )
  ) {
    reportPage(
      role,
      "/boards/:missing-id (not-found)",
      width,
      await page.eval(measureExpr(null)),
    );
  } else {
    record(
      role,
      "/boards/:missing-id (not-found)",
      width,
      "not-found state shows",
      false,
    );
  }

  await page.goto(BOARD_URL);
  await page.waitFor(
    "!!document.getElementById('members-heading')",
    "board page",
  );
  await dialogChecks(role, page, width, "delete board", DELETE_OPENER);

  await page.goto(BOARD_URL);
  await page.waitFor(
    "!!document.getElementById('members-heading')",
    "board page",
  );
  const hasMemberRow = await page.eval(
    `!!document.querySelector('button[aria-label^="Remove "]')`,
  );
  if (hasMemberRow) {
    await dialogChecks(role, page, width, "remove member", REMOVE_OPENER);
  } else {
    record(
      role,
      "remove member Confirm_Dialog",
      width,
      "a Remove control exists for a member row",
      false,
      "BOARD_ID has no member-role row",
    );
  }
}

async function memberChecks(role, page, width) {
  const noAdminControls = await page.eval(
    `![...document.querySelectorAll('button')].some((b) => /Rename board|Delete board/.test(b.textContent)) && !document.querySelector('button[aria-label^="Remove "]')`,
  );
  record(
    role,
    "/boards/:id",
    width,
    "Member sees no Rename, Delete or Remove control (Requirement 3.10)",
    noAdminControls,
  );
}

async function runRole(role, page, email, password) {
  try {
    await login(page, email, password);
  } catch (error) {
    record(
      role,
      "/login",
      null,
      "signs in through the login form",
      false,
      error.message,
    );
    return;
  }
  for (const width of WIDTHS) {
    await page.resize(width);
    await page.goto(`${ENV.origin}/`);
    await page.waitFor(
      "document.body.innerText.includes('Sign out')",
      "dashboard",
    );
    reportPage(role, "/", width, await page.eval(measureExpr(null)));

    await page.goto(BOARD_URL);
    await page.waitFor(
      "!!document.getElementById('members-heading')",
      "board page",
    );
    reportPage(role, "/boards/:id", width, await page.eval(measureExpr(null)));

    if (role === "admin") {
      await adminStates(page, role, width);
      await page.goto(BOARD_URL);
      await page.waitFor(
        "!!document.getElementById('members-heading')",
        "board page",
      );
    } else {
      await memberChecks(role, page, width);
    }
  }
}

// ---- run and report -----------------------------------------------------------------------
function finish(version) {
  const failed = results.filter((r) => !r.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    origin: ENV.origin,
    browser: version,
    device: "headless Chrome device emulation, not a real phone",
    widths: WIDTHS,
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
    },
    checks: results,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  for (const secret of SECRETS) {
    if (json.toLowerCase().includes(secret.toLowerCase())) {
      console.error("refusing to print: the report contains a sensitive value");
      process.exit(2);
    }
  }
  if (/revotask_session|Bearer |eyJ/i.test(json)) {
    console.error(
      "refusing to print: the report contains a token or cookie name",
    );
    process.exit(2);
  }
  process.stdout.write(json);
  if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, json);
  console.error(
    `\nRESULT: ${failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED of ${results.length}`}`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

async function main() {
  const { chrome, cdp, version } = await launch();
  const page = await newPage(cdp);
  let browserVersion = version;
  try {
    console.error(
      `browser: ${browserVersion} (headless, device emulation, not a real phone)`,
    );
    console.error(
      "admin: /, /boards/:id, rename form, not-found, delete and remove Confirm_Dialog",
    );
    await runRole("admin", page, ENV.adminEmail, ENV.adminPassword);
    console.error("member: /, /boards/:id");
    await runRole("member", page, ENV.memberEmail, ENV.memberPassword);
  } finally {
    try {
      await cdp.send("Browser.close");
    } catch {
      // already closed
    }
    chrome.kill();
  }
  finish(browserVersion);
}

main().catch((error) => {
  console.error("script error:", error.message);
  process.exit(2);
});
