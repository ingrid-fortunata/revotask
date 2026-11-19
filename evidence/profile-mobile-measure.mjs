// Real-browser check for the profile slice (T12): Requirements 4 to 7 (page, feedback, header link,
// mobile) and the manual journey of Requirement 7.6.
//
// Drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it
// needs no npm dependency. It uses Chrome's device emulation (not a real phone) and says so in the
// report. Playwright replaces it in T15. The stack must already be running: this script does not
// start Flask, Next.js or the database. It seeds its own throwaway accounts through the Flask API
// (three: the user under test, a second user whose email is "taken", and a user with a very long
// unbroken name and email), so it needs no pre-made accounts.
//
//   BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 \
//   REPORT_FILE=evidence/profile-mobile.json SHOT_DIR=evidence/profile-screenshots \
//   node evidence/profile-mobile-measure.mjs
//
// Environment variables
//   BASE_URL      Next.js origin (required)
//   API_URL       Flask origin, used only to seed and to read stored values (required)
//   CHROME        path to the Chrome binary (optional; defaults to the macOS install)
//   REPORT_FILE   also write the JSON report to this path (optional)
//   SHOT_DIR      write PNG screenshots at 375, 768 and 1280 px here (optional)
//
// Throwaway accounts use emails of the form ts-<hex>@t12-check.example.test. The report never
// contains a password, an email, a token or a cookie. The accounts stay in the database that Flask
// uses (users cannot be deleted through the API), so run it against a test database.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9337;
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
const PASSWORD = `Aa1!${randomBytes(3).toString("hex")}`;
const LONG_NAME = "N".repeat(80);
const USER = { email: `ts-user-${SUFFIX}@t12-check.example.test`, name: "Check User" };
const OTHER = { email: `ts-taken-${SUFFIX}@t12-check.example.test`, name: "Taken Owner" };
const LONG = { email: `${"l".repeat(70)}-${SUFFIX}@t12-check.example.test`, name: LONG_NAME };
const SECRETS = [PASSWORD];

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

async function loginToken(email) {
  return (await api("POST", "/api/auth/login", null, { email, password: PASSWORD })).access_token;
}

async function seed() {
  for (const user of [USER, OTHER, LONG]) {
    await api("POST", "/api/auth/register", null, { name: user.name, email: user.email, password: PASSWORD });
  }
}

// The stored profile of an account, read straight from Flask (a check of what was saved).
async function stored(email) {
  return api("GET", "/api/users/me", await loginToken(email));
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
        this.requests.push({ sessionId: msg.sessionId, method: msg.params.request.method, url: msg.params.request.url, postData: msg.params.request.postData });
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
      `--user-data-dir=/tmp/revotask-t12-chrome-${randomBytes(4).toString("hex")}`,
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
const SUBMIT = `document.querySelector('main form').requestSubmit()`;
const SAVE_DISABLED = `document.querySelector('main form button[type=submit]').disabled`;
const PROFILE_LINK = `document.querySelector('header a[href="/profile"]')`;

async function login(page, email) {
  await page.send("Network.clearBrowserCookies");
  await page.goto(`${ORIGIN}/login`);
  await page.type("#login-email", email);
  await page.type("#login-password", PASSWORD);
  await page.eval("document.querySelector('form').requestSubmit()");
  await page.waitFor("location.pathname === '/' && document.body.innerText.includes('Sign out')", "signed-in dashboard");
}

const patches = (page) =>
  page.cdp.requests.filter(
    (r) => r.sessionId === page.sessionId && r.method === "PATCH" && new URL(r.url).pathname === "/api/users/me",
  );

// The four header controls (Requirement 6.3, P5): the account link, Boards, My tasks and Sign out.
const HEADER_EXPR = `(() => {
  const header = document.querySelector('header');
  const hr = header.getBoundingClientRect();
  const wanted = { profile: (el) => (el.getAttribute('aria-label') || '').startsWith('Profile, '), boards: (el) => el.textContent.trim() === 'Boards', tasks: (el) => el.textContent.trim() === 'My tasks', signout: (el) => el.textContent.trim() === 'Sign out' };
  const controls = {};
  for (const [key, test] of Object.entries(wanted)) {
    const el = [...header.querySelectorAll('a, button')].find(test);
    if (!el) { controls[key] = null; continue; }
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    controls[key] = { width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10,
      visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden',
      inViewport: r.left >= 0 && r.right <= window.innerWidth,
      hitOk: !!hit && (hit === el || el.contains(hit)), current: el.getAttribute('aria-current') };
  }
  const main = document.querySelector('main');
  const mr = main.getBoundingClientRect();
  return { controls, headerBottom: Math.round(hr.bottom * 10) / 10, headerRight: Math.round(hr.right * 10) / 10,
    headerScroll: header.scrollWidth - header.clientWidth, mainTop: Math.round(mr.top * 10) / 10,
    mainLeft: Math.round(mr.left * 10) / 10, position: getComputedStyle(header).position,
    docScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
})()`;

async function headerChecks(role, label, width, page, profileCurrent) {
  const h = await page.eval(HEADER_EXPR);
  const all = Object.entries(h.controls);
  record(role, label, width, "Profile, Boards, My tasks and Sign out are all in the header", all.every(([, c]) => c), all.filter(([, c]) => !c).map(([k]) => k).join(", "));
  const present = all.filter(([, c]) => c);
  record(role, label, width, "all four header controls are visible, inside the viewport and reachable at their center", present.every(([, c]) => c.visible && c.inViewport && c.hitOk));
  const small = present.filter(([, c]) => c.width < 44 || c.height < 44);
  record(role, label, width, "each of the four header controls is at least 44x44 CSS px", present.length === 4 && small.length === 0, present.map(([k, c]) => `${k} ${c.width}x${c.height}`).join("; "));
  record(role, label, width, "the header causes no horizontal overflow", h.headerScroll <= 0 && h.docScroll <= h.innerWidth, `header ${h.headerScroll}, scrollWidth ${h.docScroll}, innerWidth ${h.innerWidth}`);
  if (width < 1024) {
    record(role, label, width, "the sticky bar does not overlap the content (main starts at or below the bar)", h.mainTop >= h.headerBottom - 0.5, `header bottom ${h.headerBottom}, main top ${h.mainTop}`);
  } else {
    record(role, label, width, "the sidebar does not overlap the content (main starts right of the sidebar)", h.mainLeft >= h.headerRight - 0.5, `sidebar right ${h.headerRight}, main left ${h.mainLeft}`);
  }
  record(role, label, width, `the account link ${profileCurrent ? "has" : "does not have"} aria-current="page"`, (h.controls.profile?.current === "page") === profileCurrent, String(h.controls.profile?.current));
}

// Tab through the page with real key events and report each focused control with its outline, so
// "visible keyboard focus" is measured on :focus-visible and not assumed.
async function tabSequence(page, count) {
  await page.eval("document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); true");
  const seen = [];
  for (let i = 0; i < count; i += 1) {
    await page.press("Tab", "Tab", 9);
    await sleep(60);
    seen.push(
      await page.eval(`(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('header').getBoundingClientRect();
        const label = el.getAttribute('aria-label') || el.id || el.textContent.trim().slice(0, 24);
        return { label, outlineWidth: parseFloat(s.outlineWidth) || 0, outlineStyle: s.outlineStyle,
                 onScreen: r.right > 0 && r.left < window.innerWidth };
      })()`),
    );
  }
  return seen.filter(Boolean);
}

async function keyboardChecks(role, label, width, page, expectFormControls) {
  const seen = await tabSequence(page, 9);
  const labels = seen.map((s) => s.label);
  const need = [(l) => l.startsWith("Profile, "), (l) => l === "Boards", (l) => l === "My tasks", (l) => l === "Sign out"];
  const reached = need.every((test) => labels.some(test));
  record(role, label, width, "Tab reaches Profile, Boards, My tasks and Sign out", reached, labels.join(" | "));
  const header = seen.filter((s) => need.some((test) => test(s.label)));
  record(role, label, width, "each of the four header controls shows a visible focus ring (outline >= 2px) when focused by keyboard", header.length >= 4 && header.every((s) => s.outlineStyle !== "none" && s.outlineWidth >= 2), header.map((s) => `${s.label}: ${s.outlineWidth}px ${s.outlineStyle}`).join("; "));
  if (expectFormControls) {
    const fields = seen.filter((s) => s.label === "profile-name" || s.label === "profile-email");
    record(role, label, width, "Tab reaches the Name and Email fields, each with a visible focus indicator", fields.length === 2 && fields.every((s) => s.outlineStyle !== "none" || s.outlineWidth > 0), fields.map((s) => `${s.label}: ${s.outlineWidth}px ${s.outlineStyle}`).join("; "));
    record(role, label, width, "Save changes is skipped by Tab while the form is pristine (it is disabled)", !labels.includes("Save changes"));
  }
}

async function shot(page, width, name) {
  if (!process.env.SHOT_DIR || !SHOT_WIDTHS.includes(width)) return;
  await sleep(250);
  await page.shot(`${process.env.SHOT_DIR}/${name}-${width}.png`);
}

// A different name that still fits the 80-character limit, also for the very long name.
const bump = (name, suffix) => (name.length + suffix.length + 1 <= 80 ? `${name} ${suffix}` : `${name.slice(0, 70)} ${suffix}`);

const COPY = {
  nameError: "Must be 1 to 80 characters.",
  taken: "An account with this email already exists.",
  toast: "Profile updated.",
};

// ---- per width: the four states of /profile (Requirement 7.6) -------------------------------
async function widthChecks(role, page, width, account) {
  const tag = (n) => `/profile ${n}`;
  await page.goto(`${ORIGIN}/profile`);
  await page.waitFor("!!document.querySelector('#profile-name')", "profile form");

  // pristine
  const m = await page.eval(measureExpr("main"));
  reportPage(role, tag("pristine"), width, m);
  record(role, tag("pristine"), width, "the form has Name and Email and no password field", await page.eval(`document.querySelectorAll('main form input').length === 2 && !document.querySelector('input[type=password]') && !!document.querySelector('#profile-name') && !!document.querySelector('#profile-email')`));
  record(role, tag("pristine"), width, "Save changes is disabled while pristine", await page.eval(SAVE_DISABLED));
  record(role, tag("pristine"), width, "the password sentence is shown", await page.eval(`document.body.innerText.includes('Password changes are not available yet.')`));
  record(role, tag("pristine"), width, "the form is seeded with the stored name and email", await page.eval(`document.querySelector('#profile-name').value === ${JSON.stringify(account.name)} && document.querySelector('#profile-email').value === ${JSON.stringify(account.email)}`));
  const before = patches(page).length;
  await page.eval(SUBMIT);
  await sleep(300);
  record(role, tag("pristine"), width, "submitting a pristine form sends no request", patches(page).length === before);
  await headerChecks(role, tag("pristine"), width, page, true);
  await keyboardChecks(role, tag("pristine"), width, page, true);
  await shot(page, width, "profile-pristine");

  // a field error (client rules)
  await page.eval(setValue("#profile-name", ""));
  await page.eval(setValue("#profile-email", "not-an-email"));
  await page.eval(SUBMIT);
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(COPY.nameError)})`, "name error");
  reportPage(role, tag("field error"), width, await page.eval(measureExpr("main")));
  record(role, tag("field error"), width, "both inline messages show and focus is on the first invalid field", await page.eval(`document.body.innerText.includes('Enter a valid email address.') && document.activeElement.id === 'profile-name' && document.querySelector('#profile-name').getAttribute('aria-invalid') === 'true'`));
  record(role, tag("field error"), width, "the invalid form sent no request", patches(page).length === before);
  await shot(page, width, "profile-field-error");

  // a 409 from Flask
  const typedName = bump(account.name, "Edited");
  await page.eval(setValue("#profile-name", typedName));
  await page.eval(setValue("#profile-email", OTHER.email));
  await page.eval(SUBMIT);
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(COPY.taken)})`, "409 message");
  reportPage(role, tag("409"), width, await page.eval(measureExpr("main")));
  record(role, tag("409"), width, "the 409 shows inline under Email, keeps both typed values and the header name", await page.eval(`document.querySelector('#profile-email').getAttribute('aria-invalid') === 'true' && document.querySelector('#profile-email').value === ${JSON.stringify(OTHER.email)} && document.querySelector('#profile-name').value === ${JSON.stringify(typedName)} && ${PROFILE_LINK}.getAttribute('aria-label') === ${JSON.stringify(`Profile, ${account.name}`)}`));
  record(role, tag("409"), width, "Save changes is enabled again after the 409", !(await page.eval(SAVE_DISABLED)));
  const stillStored = await stored(account.email);
  record(role, tag("409"), width, "nothing was stored by the 409 (the name is the original, read from Flask)", stillStored.name === account.name && stillStored.email === account.email);
  await shot(page, width, "profile-409");

  // a name-only save: only `name` is sent
  const count = patches(page).length;
  await page.eval(setValue("#profile-email", account.email));
  const savedName = bump(account.name, String(width));
  await page.eval(setValue("#profile-name", savedName));
  await page.eval(SUBMIT);
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(COPY.toast)})`, "success toast");
  const sent = patches(page).slice(count);
  record(role, tag("saved"), width, "a name-only save sends one PATCH with only the name", sent.length === 1 && JSON.stringify(Object.keys(JSON.parse(sent[0].postData ?? "{}"))) === '["name"]', sent.map((s) => s.postData ? Object.keys(JSON.parse(s.postData)).join(",") : "?").join(" | "));
  account.name = savedName;
  await page.waitFor(`${PROFILE_LINK}.getAttribute('aria-label') === ${JSON.stringify(`Profile, ${account.name}`)}`, "header name update");
  record(role, tag("saved"), width, "the header shows the new name at once, without a reload", true);
  record(role, tag("saved"), width, "the form is pristine again and the user stays on /profile", (await page.eval(SAVE_DISABLED)) && (await page.eval(`location.pathname === '/profile'`)));
  reportPage(role, tag("saved"), width, await page.eval(measureExpr("main")));
  await headerChecks(role, tag("saved"), width, page, true);
  await shot(page, width, "profile-saved");
  const after = await stored(account.email);
  record(role, tag("saved"), width, "Flask stores the new name and keeps the email (read from Flask)", after.name === account.name && after.email === account.email);
}

// ---- the manual journey at 375 px (Requirement 7.6) ------------------------------------------
async function journey(page, account) {
  const J = "journey";
  await page.resize(375);
  await login(page, account.email);
  await page.goto(`${ORIGIN}/my-tasks`);
  await page.eval(`${PROFILE_LINK}.click()`);
  await page.waitFor("location.pathname === '/profile' && !!document.querySelector('#profile-name')", "profile via the account link");
  record("user", J, 375, "the account link opens /profile (touch emulation, no hover)", true);
  await page.eval(setValue("#profile-name", "Journey Name"));
  await page.eval(SUBMIT);
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(COPY.toast)})`, "toast");
  await page.waitFor(`${PROFILE_LINK}.getAttribute('aria-label') === 'Profile, Journey Name'`, "header update");
  record("user", J, 375, "change the name, save, see the toast and the header update", true);
  await page.goto(`${ORIGIN}/profile`);
  await page.waitFor("!!document.querySelector('#profile-name')", "reload");
  record("user", J, 375, "after a reload the stored name shows in the form and the header", await page.eval(`document.querySelector('#profile-name').value === 'Journey Name' && ${PROFILE_LINK}.getAttribute('aria-label') === 'Profile, Journey Name'`));
  await page.eval(setValue("#profile-email", OTHER.email.toUpperCase()));
  await page.eval(SUBMIT);
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(COPY.taken)})`, "taken email");
  record("user", J, 375, "an email that belongs to another user (in capitals) shows the inline error", true);
  const oldEmail = account.email;
  account.email = `ts-user-moved-${SUFFIX}@t12-check.example.test`;
  await page.eval(setValue("#profile-email", ` ${account.email.toUpperCase()} `));
  await page.eval(SUBMIT);
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(COPY.toast)}) && document.querySelector('#profile-email').value === ${JSON.stringify(account.email)}`, "email saved");
  record("user", J, 375, "a free email (padded, in capitals) saves, and the form shows it trimmed and lowercased", true);
  record("user", J, 375, "the session stayed valid after the email change (the page still renders signed in)", await page.eval(`document.body.innerText.includes('Sign out') && location.pathname === '/profile'`));
  await page.eval(`[...document.querySelectorAll('header button')].find((b) => b.textContent.trim() === 'Sign out').click()`);
  await page.waitFor("location.pathname === '/login'", "signed out");
  await page.type("#login-email", oldEmail);
  await page.type("#login-password", PASSWORD);
  await page.eval("document.querySelector('form').requestSubmit()");
  await page.waitFor("document.body.innerText.includes('Invalid email or password.')", "old email refused");
  record("user", J, 375, "signing in with the old email fails", true);
  await login(page, account.email);
  record("user", J, 375, "signing in with the new email works", true);
}

async function main() {
  if (process.env.SHOT_DIR) mkdirSync(process.env.SHOT_DIR, { recursive: true });
  console.error("seeding throwaway accounts through the Flask API");
  await seed();
  const { chrome, cdp, version } = await launch();
  try {
    const page = await newPage(cdp);
    for (const [role, account] of [["user", USER], ["long-name", LONG]]) {
      console.error(`account ${role}`);
      await login(page, account.email);
      for (const width of WIDTHS) {
        await page.resize(width);
        console.error(` width ${width}`);
        await widthChecks(role, page, width, account);
      }
    }
    await journey(page, USER);
  } finally {
    chrome.kill();
  }
  const failed = results.filter((r) => !r.pass);
  const report = {
    slice: "profile (T12)",
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
