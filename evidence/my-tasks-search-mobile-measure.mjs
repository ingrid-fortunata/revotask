// Real-browser check for the my-tasks-search slice (T11): Requirements 6, 7 and 5 (journey), 8.1 and 8.9.
//
// Drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it
// needs no npm dependency. It uses Chrome's device emulation (not a real phone) and says so in the
// report. Playwright replaces it in T15. The stack must already be running: this script does not
// start Flask, Next.js or the database. It seeds its own throwaway data through the Flask API (two
// accounts, two boards, 22 searchable cards, a Done card, a long title), so it needs no pre-made
// accounts.
//
//   BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 \
//   REPORT_FILE=evidence/my-tasks-search-mobile.json SHOT_DIR=evidence/my-tasks-search-screenshots \
//   node evidence/my-tasks-search-mobile-measure.mjs
//
// Environment variables
//   BASE_URL      Next.js origin (required)
//   API_URL       Flask origin, used only to seed (required)
//   CHROME        path to the Chrome binary (optional; defaults to the macOS install)
//   REPORT_FILE   also write the JSON report to this path (optional)
//   SHOT_DIR      write PNG screenshots at 375, 768 and 1280 px here (optional)
//
// Throwaway accounts use emails of the form ts-<hex>@t11-check.example.test. The report never
// contains a password, an email, a board ID, a token or a cookie.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9336;
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
const ADMIN = { email: `ts-admin-${SUFFIX}@t11-check.example.test`, name: "Check Admin" };
const MEMBER = { email: `ts-member-${SUFFIX}@t11-check.example.test`, name: "Check Member" };
const PASSWORD = `Aa1!${randomBytes(9).toString("hex")}`;
const SECRETS = [ADMIN.email, MEMBER.email, PASSWORD];
const LONG_TITLE = `Unbroken${"x".repeat(140)}`;
const NOTE = "A longer description that should be clamped to two lines on the My tasks page. ".repeat(6);

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
  MEMBER.id = (await api("GET", "/api/users/me", MEMBER.token)).id;
  const mk = async (name) => {
    const board = await api("POST", "/api/boards", ADMIN.token, { name });
    await api("POST", `/api/boards/${board.id}/members`, ADMIN.token, { email: MEMBER.email });
    return board;
  };
  const alpha = await mk("Alpha board");
  const beta = await mk("Beta board");
  const todo = (await api("POST", `/api/boards/${alpha.id}/columns`, ADMIN.token, { name: "To do" })).column;
  const done = (await api("POST", `/api/boards/${alpha.id}/columns`, ADMIN.token, { name: "Done", is_done: true })).column;
  const betaTodo = (await api("POST", `/api/boards/${beta.id}/columns`, ADMIN.token, { name: "To do" })).column;
  const card = async (column, title, extra = {}) =>
    (await api("POST", `/api/columns/${column.id}/cards`, ADMIN.token, { title, ...extra })).card;
  for (let n = 1; n <= 22; n += 1) {
    const title = `Search task ${String(n).padStart(2, "0")}`;
    await card(todo, title, n === 1 ? { assignee_id: MEMBER.id, description: NOTE } : {});
  }
  await card(done, "Finished work", { assignee_id: MEMBER.id });
  await card(todo, LONG_TITLE, { assignee_id: MEMBER.id });
  await card(betaTodo, "Beta task", { assignee_id: MEMBER.id });
  return { alpha, beta };
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
      `--user-data-dir=/tmp/revotask-t11-chrome-${randomBytes(4).toString("hex")}`,
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


// ---- page helpers --------------------------------------------------------------------------
const setValue = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;
const SEARCH_PANEL = `document.querySelector('#card-search').closest('.surface')`;
const RESULT_LABELS = `[...document.querySelectorAll('ul[aria-label="Search results"] button')].map((b) => b.getAttribute('aria-label'))`;
const BOARD = (id) => `${ORIGIN}/boards/${id}`;

async function login(page, email) {
  await page.send("Network.clearBrowserCookies");
  await page.goto(`${ORIGIN}/login`);
  await page.type("#login-email", email);
  await page.type("#login-password", PASSWORD);
  await page.eval("document.querySelector('form').requestSubmit()");
  await page.waitFor("location.pathname === '/' && document.body.innerText.includes('Sign out')", "signed-in dashboard");
}

// Wraps fetch once per page load so a search can be delayed or failed on purpose.
const WRAP_FETCH = `(() => {
  if (window.__wrapped) return true;
  window.__wrapped = true;
  window.__delays = [];
  window.__fail = false;
  window.__searchCalls = 0;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/cards/search')) {
      window.__searchCalls += 1;
      if (window.__fail) return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x' } }), { status: 500, headers: { 'content-type': 'application/json' } });
      const delay = window.__delays.shift() ?? 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return original(input, init);
  };
  return true;
})()`;

// The AppHeader links and the sticky bar (Requirements 6.1 to 6.3, Q6): both links visible,
// reachable, 44x44, no overflow from the header, and no overlap of the bar over the content.
const HEADER_EXPR = `(() => {
  const header = document.querySelector('header');
  const hr = header.getBoundingClientRect();
  const links = [...document.querySelectorAll('header nav a')].map((a) => {
    const r = a.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { name: a.textContent.trim(), width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10,
             visible: r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== 'hidden',
             hitOk: !!hit && (hit === a || a.contains(hit)), inViewport: r.left >= 0 && r.right <= window.innerWidth,
             current: a.getAttribute('aria-current') };
  });
  const main = document.querySelector('main');
  const mr = main.getBoundingClientRect();
  const sticky = getComputedStyle(header).position;
  return { links, headerBottom: Math.round(hr.bottom * 10) / 10, headerRight: Math.round(hr.right * 10) / 10, headerScroll: header.scrollWidth - header.clientWidth,
           mainTop: Math.round(mr.top * 10) / 10, mainLeft: Math.round(mr.left * 10) / 10, position: sticky,
           docScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
})()`;

async function headerChecks(role, label, width, page, expectCurrent) {
  const h = await page.eval(HEADER_EXPR);
  const names = h.links.map((l) => l.name);
  record(role, label, width, "Boards and My tasks are both in the header", names.includes("Boards") && names.includes("My tasks"), names.join(", "));
  record(role, label, width, "both header links are visible, inside the viewport and reachable at their center", h.links.every((l) => l.visible && l.inViewport && l.hitOk));
  const small = h.links.filter((l) => l.width < 44 || l.height < 44);
  record(role, label, width, "each header link is at least 44x44 CSS px", h.links.length === 2 && small.length === 0, h.links.map((l) => `${l.name} ${l.width}x${l.height}`).join("; "));
  record(role, label, width, "the header causes no horizontal overflow", h.headerScroll <= 0 && h.docScroll <= h.innerWidth, `header ${h.headerScroll}, scrollWidth ${h.docScroll}, innerWidth ${h.innerWidth}`);
  if (width < 1024) {
    record(role, label, width, "the sticky bar does not overlap the content (main starts at or below the bar)", h.mainTop >= h.headerBottom - 0.5, `header bottom ${h.headerBottom}, main top ${h.mainTop}`);
    record(role, label, width, "the header is a sticky top bar", h.position === "sticky");
  } else {
    record(role, label, width, "the sidebar does not overlap the content (main starts right of the sidebar)", h.mainLeft >= h.headerRight - 0.5, `sidebar right ${h.headerRight}, main left ${h.mainLeft}`);
  }
  const current = h.links.filter((l) => l.current === "page").map((l) => l.name);
  record(role, label, width, `the current page link is ${expectCurrent}`, current.length === 1 && current[0] === expectCurrent, current.join(", "));
}

// A control that takes focus after the page was scrolled is not hidden under the sticky bar.
async function focusNotHidden(role, label, width, page, selector) {
  const ok = await page.eval(`(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.focus();
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const bar = document.querySelector('header').getBoundingClientRect();
    window.scrollTo(0, 0);
    return { hitOk: !!hit && (hit === el || el.contains(hit)), top: Math.round(r.top), barBottom: Math.round(bar.bottom) };
  })()`);
  record(role, label, width, "a focused control after a scroll is not hidden under the sticky bar", ok && ok.hitOk, ok ? `top ${ok.top}, bar bottom ${ok.barBottom}` : "control missing");
}

async function shot(page, width, name) {
  if (!process.env.SHOT_DIR || !SHOT_WIDTHS.includes(width)) return;
  await sleep(200);
  await page.shot(`${process.env.SHOT_DIR}/${name}-${width}.png`);
}

// ---- the checks ----------------------------------------------------------------------------
async function typeSearch(page, text) {
  await page.eval(setValue("#card-search", text));
}

async function searchStates(role, page, width) {
  const P = "board search";
  await page.goto(BOARD(ids.alpha.id));
  await page.waitFor(`!!document.querySelector('#card-search')`, "board with search");
  await page.eval(WRAP_FETCH);
  const field = await page.eval(`(() => { const e = document.querySelector('#card-search'); return { fs: parseFloat(getComputedStyle(e).fontSize), type: e.type, max: e.maxLength }; })()`);
  record(role, P, width, "the search field is type=search, limited to 100 and 16 px or more", field.type === "search" && field.max === 100 && field.fs >= 16, `${field.fs}px`);
  reportPage(role, `${P} idle`, width, await page.eval(measureExpr(null)));
  const idleText = await page.eval(`document.body.innerText`);
  record(role, P, width, "idle shows no results block and no result message", !idleText.includes("No cards match") && !idleText.includes("Searching") && (await page.eval(`!document.querySelector('ul[aria-label="Search results"]')`)));

  // loading
  await page.eval(`window.__delays = [2500]`);
  await typeSearch(page, "Search task 0");
  const loading = await page.tryWait(`document.body.innerText.includes('Searching…')`, 3000);
  record(role, P, width, "a valid query shows Searching… during the debounce and the request", loading);
  reportPage(role, `${P} loading`, width, await page.eval(measureExpr(null)));
  await shot(page, width, "search-loading");
  record(role, P, width, "results appear after the delayed response", await page.tryWait(`${RESULT_LABELS}.length === 9`, 8000), "9 matches");

  // results
  reportPage(role, `${P} results`, width, await page.eval(measureExpr(null)));
  const noCap = await page.eval(`!document.body.innerText.includes('Showing')`);
  record(role, P, width, "fewer than 20 results show no count line", noCap);
  await shot(page, width, "search-results");

  // 20 results
  await typeSearch(page, "Search task");
  record(role, P, width, "20 returned results show Showing 20 results.", await page.tryWait(`document.body.innerText.includes('Showing 20 results.')`, 6000));
  reportPage(role, `${P} 20 results`, width, await page.eval(measureExpr(null)));
  await shot(page, width, "search-20-results");

  // no results
  await typeSearch(page, "zzzz");
  record(role, P, width, "no match shows the distinct no-result message", await page.tryWait(`document.body.innerText.includes('No cards match “zzzz”.')`, 6000));
  reportPage(role, `${P} no results`, width, await page.eval(measureExpr(null)));
  await shot(page, width, "search-no-results");

  // error with Retry
  await page.eval(`window.__fail = true`);
  await typeSearch(page, "Search task 1");
  record(role, P, width, "a failed search shows the error message and Retry", await page.tryWait(`document.body.innerText.includes('Search could not be completed.') && !!document.evaluate("//button[normalize-space()='Retry']", document, null, 9, null).singleNodeValue`, 6000));
  reportPage(role, `${P} error`, width, await page.eval(measureExpr(null)));
  await shot(page, width, "search-error");
  await page.eval(`window.__fail = false`);
  await page.eval(`document.evaluate("//button[normalize-space()='Retry']", document, null, 9, null).singleNodeValue.click()`);
  record(role, P, width, "Retry recovers and shows results", await page.tryWait(`${RESULT_LABELS}.length > 0`, 6000));

  // blank clears at once
  await typeSearch(page, "");
  record(role, P, width, "a blank query clears results and loading at once", await page.tryWait(`${RESULT_LABELS}.length === 0 && !document.body.innerText.includes('Searching')`, 1000));
}

async function widthChecks(role, page, width) {
  const pages = [["/", "dashboard", "Boards"], ["/my-tasks", "my tasks", "My tasks"]];
  for (const [path, name, current] of pages) {
    await page.goto(`${ORIGIN}${path}`);
    await page.waitFor(`!!document.querySelector('main')`, name);
    await headerChecks(role, name, width, page, current);
    if (path === "/my-tasks") {
      if (role === "member") {
        await page.waitFor(`document.body.innerText.includes('Alpha board')`, "tasks");
        reportPage(role, "my tasks", width, await page.eval(measureExpr(null)));
        const g = await page.eval(`(() => {
          const heads = [...document.querySelectorAll('main h2')].map((h) => h.textContent.trim().replace(/^[A-Z]/, ''));
          const summary = [...document.querySelectorAll('main p.surface')].map((p) => p.textContent.replace(/\\s+/g, ' ').trim());
          const long = [...document.querySelectorAll('main a span')].find((s) => s.textContent.startsWith('Unbroken'));
          const clamp = document.querySelector('main .line-clamp-2');
          return { heads, summary, longWraps: !!long && long.scrollWidth <= long.clientWidth + 1, clamped: !!clamp && getComputedStyle(clamp).webkitLineClamp === '2' };
        })()`);
        record(role, "my tasks", width, "groups follow the API order (Alpha board, Beta board)", g.heads.join("|") === "Alpha board|Beta board", g.heads.join("|"));
        record(role, "my tasks", width, "the summary counts tasks and boards", g.summary[0] === "4 tasks on 2 boards", g.summary[0]);
        record(role, "my tasks", width, "a 148-character unbroken title wraps inside its row", g.longWraps);
        record(role, "my tasks", width, "a long description is clamped to two lines", g.clamped);
        await focusNotHidden(role, "my tasks", width, page, "main a[href^='/boards/']:last-of-type");
        await shot(page, width, "my-tasks");
      } else {
        await page.waitFor(`document.body.innerText.includes('No cards are assigned to you.')`, "empty state");
        reportPage(role, "my tasks empty", width, await page.eval(measureExpr(null)));
        await shot(page, width, "my-tasks-empty");
      }
    } else {
      reportPage(role, "dashboard", width, await page.eval(measureExpr(null)));
    }
  }
  if (role === "member") {
    await searchStates(role, page, width);
    await page.goto(BOARD(ids.alpha.id));
    await page.waitFor(`!!document.querySelector('#card-search')`, "board");
    await headerChecks(role, "board page", width, page, "Boards");
  }
}

// ---- the manual journey at 375 px ----------------------------------------------------------
async function journey(page) {
  const J = "journey";
  const W = 375;
  await login(page, MEMBER.email);
  await page.resize(W);
  await page.goto(`${ORIGIN}/`);
  await page.eval(`document.querySelector('header nav a[href="/my-tasks"]').click()`);
  record("member", J, W, "My tasks opens from the top bar link by touch (no address typed)", await page.tryWait(`location.pathname === '/my-tasks' && document.body.innerText.includes('Alpha board')`, 8000));
  await page.eval(`[...document.querySelectorAll('main h2 a')].find((a) => a.textContent.includes('Alpha board')).click()`);
  record("member", J, W, "a board link on My tasks opens that board", await page.tryWait(`location.pathname === '/boards/${ids.alpha.id}' && !!document.querySelector('#card-search')`, 8000));
  await page.eval(WRAP_FETCH);

  await typeSearch(page, "Search task 01");
  const found = await page.tryWait(`${RESULT_LABELS}.includes('Search task 01, in To do')`, 6000);
  record("member", J, W, "a query shows its result with the card's column", found);
  await page.eval(`(() => { const b = document.querySelector('ul[aria-label="Search results"] button[aria-label="Search task 01, in To do"]'); window.__result = b; b.focus(); b.click(); })()`);
  const opened = await page.tryWait(`!!document.querySelector('dialog[open]') && document.querySelector('dialog[open] #edit-card-title')?.value === 'Search task 01'`, 6000);
  record("member", J, W, "selecting a result opens Card details for that card", opened);
  await page.press("Escape", "Escape", 27);
  await page.tryWait(`!document.querySelector('dialog[open]')`);
  record("member", J, W, "after Escape, focus returns to the result that opened the dialog", await page.eval(`document.activeElement === window.__result`));

  // rename: the result follows the live board
  await page.eval(`document.querySelector('ul[aria-label="Search results"] button[aria-label="Search task 01, in To do"]').click()`);
  await page.tryWait(`!!document.querySelector('dialog[open]')`);
  await page.eval(`(() => { const e = document.querySelector('dialog[open] #edit-card-title'); e.focus(); e.select(); })()`);
  await page.send("Input.insertText", { text: "Renamed away" });
  await page.eval(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Save card').click()`);
  await page.tryWait(`!document.querySelector('dialog[open]')`, 6000);
  record("member", J, W, "after a rename that no longer matches, the result disappears without a new request", await page.tryWait(`!${RESULT_LABELS}.some((l) => l.startsWith('Search task 01')) && document.body.innerText.includes('No cards match “Search task 01”.')`, 4000));

  // a rename that still matches shows the new title
  await typeSearch(page, "Search task 02");
  await page.tryWait(`${RESULT_LABELS}.includes('Search task 02, in To do')`, 6000);
  await page.eval(`document.querySelector('ul[aria-label="Search results"] button').click()`);
  await page.tryWait(`!!document.querySelector('dialog[open]')`);
  await page.eval(`(() => { const e = document.querySelector('dialog[open] #edit-card-title'); e.focus(); e.select(); })()`);
  await page.send("Input.insertText", { text: "Search task 02 renamed" });
  await page.eval(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Save card').click()`);
  await page.tryWait(`!document.querySelector('dialog[open]')`, 6000);
  record("member", J, W, "a rename that still matches shows the new title in the result", await page.tryWait(`${RESULT_LABELS}.includes('Search task 02 renamed, in To do')`, 4000));

  // delete a card from the dialog: the result goes
  await page.eval(`document.querySelector('ul[aria-label="Search results"] button').click()`);
  await page.tryWait(`!!document.querySelector('dialog[open]')`);
  await page.eval(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Delete card').click()`);
  await sleep(300);
  await page.eval(`(() => { const ds = [...document.querySelectorAll('dialog[open]')]; const d = ds[ds.length - 1]; [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete card').click(); })()`);
  await page.tryWait(`!document.querySelector('dialog[open]')`, 6000);
  record("member", J, W, "after deleting the card, its result is gone", await page.tryWait(`!${RESULT_LABELS}.some((l) => l.startsWith('Search task 02'))`, 4000));

  // clear and a no-result query
  await typeSearch(page, "");
  record("member", J, W, "clearing the query returns to idle", await page.tryWait(`${RESULT_LABELS}.length === 0 && !document.body.innerText.includes('No cards match')`, 2000));
  await typeSearch(page, "qqqq nothing");
  record("member", J, W, "a no-result query shows the no-result message", await page.tryWait(`document.body.innerText.includes('No cards match “qqqq nothing”.')`, 6000));

  // late response: the first (slow) request cannot replace the newer results
  await typeSearch(page, "");
  await page.eval(`window.__delays = [1800]; window.__searchCalls = 0`);
  await typeSearch(page, "Search task 05");
  await sleep(450); // past the 300 ms debounce: the slow request is in flight
  await typeSearch(page, "zzzz late");
  const newer = await page.tryWait(`document.body.innerText.includes('No cards match “zzzz late”.')`, 6000);
  await sleep(2000); // the slow response arrives now
  const still = await page.eval(`document.body.innerText.includes('No cards match “zzzz late”.') && ${RESULT_LABELS}.length === 0`);
  record("member", J, W, "a late response of an earlier query does not overwrite the newer results", newer && still, `${await page.eval("window.__searchCalls")} search requests`);

  // handler checks through the real same-origin handler (cookie only, no token in the record)
  const probe = (query) => page.eval(`(async () => {
    const r = await fetch('/api/boards/${ids.alpha.id}/cards/search${query}', { credentials: 'same-origin' });
    const b = await r.json().catch(() => null);
    return { status: r.status, code: b?.error?.code ?? null, fields: b?.error?.fields ?? null, message: b?.error?.message ?? null, noStore: r.headers.get('cache-control') };
  })()`);
  const cases = [
    ["?q=a&q=b", "a repeated q", { q: "Send one value." }],
    ["?q=a&foo=1", "an unknown key beside q", null],
    ["?q=", "a blank q", { q: "Required." }],
    ["?q=%00", "a NUL q", { q: "Enter valid text." }],
  ];
  for (const [query, label, fields] of cases) {
    const r = await probe(query);
    record("member", "handler", 0, `the same-origin handler returns the Flask 400 for ${label}`, r.status === 400 && r.code === "VALIDATION_ERROR" && JSON.stringify(r.fields) === JSON.stringify(fields) && r.message === "Check the submitted fields.", `status ${r.status}, fields ${JSON.stringify(r.fields)}`);
    record("member", "handler", 0, `the response for ${label} is private, no-store`, (r.noStore ?? "").includes("no-store"));
  }
  const ok = await probe("?q=Search");
  record("member", "handler", 0, "a valid query through the handler returns 200", ok.status === 200);
}

let ids;
async function main() {
  if (process.env.SHOT_DIR) mkdirSync(process.env.SHOT_DIR, { recursive: true });
  console.error("seeding throwaway data through the Flask API");
  ids = await seed();
  const { chrome, cdp, version } = await launch();
  try {
    const page = await newPage(cdp);
    for (const role of ["member", "admin"]) {
      console.error(`role ${role} (${role === "member" ? "has assignments" : "has none"})`);
      await login(page, role === "admin" ? ADMIN.email : MEMBER.email);
      for (const width of WIDTHS) {
        await page.resize(width);
        console.error(` width ${width}`);
        await widthChecks(role, page, width);
      }
    }
    await journey(page);
  } finally {
    chrome.kill();
    for (const board of [ids.alpha, ids.beta]) await api("DELETE", `/api/boards/${board.id}`, ADMIN.token).catch(() => {});
  }
  const failed = results.filter((r) => !r.pass);
  const report = {
    slice: "my-tasks-search (T11)",
    browser: version,
    mode: "headless Chrome with device emulation (not a real phone), touch emulation below 640 px",
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
