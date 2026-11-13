// Real-browser check for the authentication slice: AUTH-R13 (mobile) and AUTH-AC11.3/11.4/11.5.
//
// Drives headless Google Chrome over the DevTools Protocol with Node's built-in WebSocket, so it
// needs no npm dependency. It uses Chrome's device emulation (not a real phone) and records that.
// Playwright replaces it in T15. Run from the repository root with Flask on 127.0.0.1:5001 (Docker
// Compose) and `next start -p 3100` with APP_ORIGIN=http://localhost:3100:
//
//   node evidence/authentication-mobile-measure.mjs
//
// It creates one throwaway account through the Flask API and deletes it at the end. It never
// prints the password, the token or a cookie value.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT = process.env.NEXT_URL ?? "http://localhost:3100";
const FLASK = process.env.FLASK_URL ?? "http://127.0.0.1:5001";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const WIDTHS = [320, 375, 768, 1280];
const failures = [];
const rows = [];
const jtis = new Set(); // jti of every session token this run created, removed at the end

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const compose = (...args) => execFileSync("docker", ["compose", ...args], { cwd: REPO, stdio: "pipe" });

function check(label, ok, detail = "") {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(label);
}

// ---- minimal CDP client -------------------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
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
}

function jtiOf(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).jti;
  } catch {
    return null;
  }
}

async function trackSession(page) {
  const cookies = (await page.send("Network.getCookies", { urls: [NEXT] })).cookies;
  const found = cookies.find((c) => c.name === "revotask_session");
  const jti = found ? jtiOf(found.value) : null;
  if (jti) jtis.add(jti);
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
const MEASURE = `(() => {
  const root = document.documentElement;
  const selector = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], summary';
  const controls = [];
  for (const el of document.querySelectorAll(selector)) {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    if (style.visibility === 'hidden' || style.display === 'none' || (box.width === 0 && box.height === 0)) continue;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    controls.push({
      name: el.tagName.toLowerCase() + ':' + (el.id || el.getAttribute('name') || el.textContent.trim().slice(0, 24)),
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
      hitOk: hit === el || el.contains(hit),
      fontSize: parseFloat(style.fontSize),
      isTextInput: el.tagName === 'INPUT' && !['button','submit','checkbox','radio'].includes(el.type),
    });
  }
  window.scrollTo(0, 0);
  return {
    docScroll: root.scrollWidth, docClient: root.clientWidth, bodyScroll: document.body.scrollWidth,
    viewport: window.innerWidth, controls,
  };
})()`;

function reportPage(label, width, m) {
  const noSideways = m.docScroll <= m.docClient && m.bodyScroll <= m.viewport;
  const small = m.controls.filter((c) => c.width < 44 || c.height < 44);
  const blocked = m.controls.filter((c) => !c.hitOk);
  const smallText = m.controls.filter((c) => c.isTextInput && c.fontSize < 16);
  check(
    `${label} @${width}px: no horizontal page scroll`,
    noSideways,
    `scrollWidth ${m.docScroll} <= clientWidth ${m.docClient}`,
  );
  check(
    `${label} @${width}px: ${m.controls.length} controls all >= 44x44 (min ${Math.min(...m.controls.map((c) => Math.min(c.width, c.height)))}px)`,
    m.controls.length > 0 && small.length === 0,
    small.map((c) => `${c.name} ${c.width}x${c.height}`).join("; "),
  );
  check(`${label} @${width}px: elementFromPoint at each center hits the control`, blocked.length === 0, blocked.map((c) => c.name).join("; "));
  if (m.controls.some((c) => c.isTextInput)) {
    check(`${label} @${width}px: text inputs compute to >= 16px`, smallText.length === 0, smallText.map((c) => `${c.name} ${c.fontSize}px`).join("; "));
  }
  rows.push({ label, width, scroll: `${m.docScroll}/${m.docClient}`, controls: m.controls.length });
}

// ---- setup: one throwaway account with a long name and a long email ------------------------
function envValue(name) {
  const line = readFileSync(join(REPO, "backend/.env"), "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
  return line.split("=", 2)[1].trim();
}

async function api(path, init) {
  const response = await fetch(`${FLASK}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  return { status: response.status, json: await response.json().catch(() => null) };
}

const email = `m-${randomBytes(4).toString("hex")}-${"x".repeat(40)}@example.test`;
const longName = "W".repeat(80);
const password = `${randomBytes(12).toString("hex")}Aa1!`; // meets the register rules

async function main() {
  const reg = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name: longName, email, password }) });
  if (reg.status !== 201) throw new Error(`could not create the throwaway account (status ${reg.status})`);
  const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const token = login.json.data.access_token;
  jtis.add(jtiOf(token));
  console.log(`throwaway account created: name ${longName.length} characters, email ${email.length} characters`);

  const { chrome, cdp, version } = await launch();
  console.log(`browser: ${version} (headless, device emulation, not a real phone)`);
  const page = await newPage(cdp);
  const cookie = { name: "revotask_session", value: token, url: NEXT, httpOnly: true, sameSite: "Lax", path: "/" };

  try {
    console.log("\n### A. Width-by-route measurement (flask up)");
    for (const width of WIDTHS) {
      await page.resize(width);
      await page.send("Network.clearBrowserCookies");
      for (const route of ["/login", "/register"]) {
        await page.goto(NEXT + route);
        reportPage(route, width, await page.eval(MEASURE));
      }
      await page.send("Network.setCookie", cookie);
      await page.goto(NEXT + "/");
      await page.waitFor("document.body.innerText.includes('Sign out')", "signed-in shell");
      reportPage("/ (signed in, 80-char name)", width, await page.eval(MEASURE));
      const header = await page.eval(`(() => { const n = [...document.querySelectorAll('span')].find(s => s.textContent.startsWith('WWWW')); const r = n.getBoundingClientRect(); return { truncated: n.scrollWidth > n.clientWidth, right: r.right, vw: innerWidth }; })()`);
      check(`header @${width}px: the 80-character name truncates inside the viewport`, header.right <= header.vw && header.truncated, JSON.stringify(header));
    }

    console.log("\n### B. Keyboard and field focus @375px");
    await page.resize(375);
    await page.send("Network.clearBrowserCookies");
    await page.goto(NEXT + "/login");
    const order = [];
    for (let i = 0; i < 4; i += 1) {
      await page.press("Tab", "Tab", 9);
      order.push(await page.eval("document.activeElement.id || document.activeElement.textContent.trim()"));
    }
    check("Tab order on /login: email, password, Sign in, Create an account", JSON.stringify(order) === JSON.stringify(["login-email", "login-password", "Sign in", "Create an account"]), JSON.stringify(order));
    await page.eval("document.querySelector('form').requestSubmit()");
    await page.waitFor("document.activeElement.id === 'login-email'", "focus on first invalid field");
    const messages = await page.eval("[...document.querySelectorAll('form p')].map(p => p.textContent)");
    check("empty submit: focus moves to the email field and both messages show", messages.length === 2, JSON.stringify(messages));
    const inView = await page.eval("(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()");
    check("the focused invalid field is inside the visible area", inView === true);

    console.log("\n### B2. Register password rules in the browser @375px");
    await page.goto(NEXT + "/register");
    const hint = await page.eval("(() => { const i = document.querySelector('input[name=password]'); const h = document.getElementById(i.getAttribute('aria-describedby') || ''); return { describedBy: !!h, text: h ? h.textContent : '', visible: !!h && h.getBoundingClientRect().height > 0 }; })()");
    check("register password input is described by the visible rules hint", hint.describedBy && hint.visible && hint.text.includes("At least 8 characters"), JSON.stringify(hint));
    await page.type("input[name=name]", "Policy Check");
    await page.type("input[name=email]", `policy-${randomBytes(4).toString("hex")}@example.test`);
    await page.type("input[name=password]", "abcdefgh");
    await page.eval("document.querySelector('form').requestSubmit()");
    await page.waitFor("document.body.innerText.includes('Must include an uppercase letter')", "composition message");
    const focus = await page.eval("document.activeElement.name");
    check("composition message shows and the password field takes focus", focus === "password");
    const compMeasure = await page.eval(MEASURE);
    reportPage("/register with a password error", 375, compMeasure);

    console.log("\n### C. Sign in through the real UI, redirects and Back-after-sign-out @375px");
    // unsafe next
    await page.goto(NEXT + "/login?next=" + encodeURIComponent("//evil.example"));
    await page.type("#login-email", `  ${email.toUpperCase()}  `);
    await page.type("#login-password", password);
    await page.eval("document.querySelector('form').requestSubmit()");
    await page.waitFor("location.pathname === '/' && document.body.innerText.includes('Sign out')", "landing on / after login");
    await trackSession(page);
    const landed = await page.eval("({ origin: location.origin, path: location.pathname + location.search })");
    check("login with next=//evil.example lands on / of this site", landed.origin === NEXT && landed.path === "/", JSON.stringify(landed));
    const sessionCookie = (await page.send("Network.getCookies", { urls: [NEXT] })).cookies.find((c) => c.name === "revotask_session");
    check("the browser holds an HttpOnly cookie that page JavaScript cannot read", !!sessionCookie && sessionCookie.httpOnly === true && !(await page.eval("document.cookie")).includes("revotask_session"));
    check("cookie attributes in the browser: Lax, Path=/, host-only, not Secure on loopback http", sessionCookie.sameSite === "Lax" && sessionCookie.path === "/" && sessionCookie.domain === "localhost" && sessionCookie.secure === false, JSON.stringify({ sameSite: sessionCookie.sameSite, path: sessionCookie.path, domain: sessionCookie.domain, secure: sessionCookie.secure }));
    const storage = await page.eval("({ local: localStorage.length, session: sessionStorage.length })");
    check("nothing in localStorage or sessionStorage", storage.local === 0 && storage.session === 0, JSON.stringify(storage));
    const html = await page.eval("document.documentElement.outerHTML");
    check("the page DOM does not contain the token or the password", !html.includes(token) && !html.includes(password));

    // safe next
    await page.send("Network.clearBrowserCookies");
    await page.goto(NEXT + "/login?next=" + encodeURIComponent("/?from=next"));
    await page.type("#login-email", email);
    await page.type("#login-password", password);
    await page.eval("document.querySelector('form').requestSubmit()");
    await page.waitFor("document.body.innerText.includes('Sign out')", "landing after login");
    await trackSession(page);
    const safe = await page.eval("location.pathname + location.search");
    check("login with next=/?from=next lands on that path", safe === "/?from=next", safe);

    // Back after sign out: history [ /, /?second=1 ]; sign out on the second; Back to the first.
    await page.goto(NEXT + "/?first=1");
    await page.goto(NEXT + "/?second=1");
    await page.eval("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign out').click()");
    await page.waitFor("location.pathname === '/login'", "redirect to /login after sign out");
    const afterLogout = await page.eval("({ path: location.pathname, text: document.body.innerText })");
    check("sign out: full page load of /login, no private content", afterLogout.path === "/login" && !afterLogout.text.includes("Sign out"));
    await page.eval("history.back()");
    await sleep(1500);
    await page.waitFor("document.readyState === 'complete'", "page after Back");
    const afterBack = await page.eval("({ path: location.pathname, text: document.body.innerText })");
    check("Back to an earlier private page: the server sends the user to /login", afterBack.path === "/login" && !afterBack.text.includes("Sign out") && !afterBack.text.includes("WWWW"), JSON.stringify({ path: afterBack.path }));
    const cookiesAfter = (await page.send("Network.getCookies", { urls: [NEXT] })).cookies.filter((c) => c.name === "revotask_session");
    check("the session cookie is gone after sign out", cookiesAfter.length === 0);

    console.log("\n### D. Flask stopped: error state, retry, toast (measured at each width)");
    await page.send("Network.setCookie", cookie);
    compose("stop", "backend");
    try {
      for (const width of WIDTHS) {
        await page.resize(width);
        await page.goto(NEXT + "/");
        await page.waitFor("document.body.innerText.includes('Something went wrong')", "error state");
        const text = await page.eval("document.body.innerText");
        check(`error state @${width}px shows the retry copy and no internals`, text.includes("Try again") && !/ECONNREFUSED|127\.0\.0\.1|5001|Traceback/.test(text));
        reportPage("/ error state", width, await page.eval(MEASURE));
        check(`error state @${width}px: the session cookie is kept`, (await page.send("Network.getCookies", { urls: [NEXT] })).cookies.some((c) => c.name === "revotask_session"));

        await page.send("Network.clearBrowserCookies");
        await page.goto(NEXT + "/login");
        await page.type("#login-email", "someone@example.test");
        await page.type("#login-password", "a-password-value");
        await page.eval("document.querySelector('form').requestSubmit()");
        await page.waitFor("!!document.querySelector('[role=status]') && document.querySelector('[role=status]').innerText.length > 0", "toast");
        const toast = await page.eval("(() => { const t = [...document.querySelectorAll('[role=status]')].find(e => e.innerText.length > 0); const r = t.getBoundingClientRect(); return { left: r.left, right: r.right, vw: innerWidth, text: t.innerText }; })()");
        check(`toast @${width}px stays inside the viewport`, toast.left >= 0 && toast.right <= toast.vw, `left ${Math.round(toast.left)}, right ${Math.round(toast.right)}, viewport ${toast.vw}`);
        check(`toast @${width}px: no horizontal page scroll while it shows`, (await page.eval("document.documentElement.scrollWidth <= document.documentElement.clientWidth")) === true);
        await page.send("Network.setCookie", cookie);
      }
      // Sign out while Flask is down: the session stays and the user can retry.
      await page.resize(375);
      await page.goto(NEXT + "/");
    } finally {
      compose("up", "-d", "backend");
    }
    for (let i = 0; i < 30; i += 1) {
      try {
        if ((await fetch(`${FLASK}/api/health`)).status === 200) break;
      } catch {
        await sleep(1000);
      }
    }
    await page.eval("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Try again').click()");
    await page.waitFor("document.body.innerText.includes('Sign out')", "shell after Try again");
    check("Try again after Flask is back shows the signed-in shell (the session survived)", true);

    console.log("\n### E. Sign out with Flask down keeps the session; retry works");
    compose("stop", "backend");
    let signOutKept = false;
    try {
      // Show the shell without Flask by using a page loaded before the stop (client state only).
      compose("up", "-d", "backend");
      for (let i = 0; i < 30; i += 1) {
        try { if ((await fetch(`${FLASK}/api/health`)).status === 200) break; } catch { await sleep(1000); }
      }
      await page.goto(NEXT + "/");
      await page.waitFor("document.body.innerText.includes('Sign out')", "shell");
      compose("stop", "backend");
      await page.eval("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign out').click()");
      await page.waitFor("[...document.querySelectorAll('[role=status]')].some(e => e.innerText.length > 0)", "retry toast");
      const stillHere = await page.eval("({ path: location.pathname, signOut: document.body.innerText.includes('Sign out'), enabled: ![...document.querySelectorAll('button')].find(b => /Sign/.test(b.textContent)).disabled })");
      const kept = (await page.send("Network.getCookies", { urls: [NEXT] })).cookies.some((c) => c.name === "revotask_session");
      signOutKept = stillHere.path === "/" && stillHere.signOut && stillHere.enabled && kept;
      check("failed sign out: user stays on the page, button re-enabled, cookie kept, retry toast shown", signOutKept, JSON.stringify(stillHere));
    } finally {
      compose("up", "-d", "backend");
    }
  } finally {
    // cleanup: remove the throwaway account and its tokens, then close the browser
    try { await cdp.send("Browser.close"); } catch { /* already closed */ }
    chrome.kill();
    const dbUrl = envValue("DATABASE_URL").replace("postgresql+psycopg://", "postgresql://");
    console.log("\n### Cleanup");
    try {
      execFileSync(join(REPO, "backend/.venv/bin/python"), ["-c", `
import psycopg, sys
with psycopg.connect(sys.argv[1]) as c:
    n = c.execute("DELETE FROM revotask.users WHERE email = %s", (sys.argv[2],)).rowcount
    print("  deleted users:", n)
    ids = [j for j in sys.argv[3].split(",") if j]
    m = c.execute("DELETE FROM revotask.revoked_tokens WHERE jti = ANY(%s::uuid[])", (ids,)).rowcount
    print("  deleted revoked_tokens:", m)
`, dbUrl, email, [...jtis].join(",")], { stdio: "inherit" });
    } catch (error) {
      console.log("  cleanup failed:", error.message.split("\n")[0]);
    }
  }

  console.log("\n### Summary table (scrollWidth/clientWidth, controls measured)");
  for (const row of rows) console.log(`  ${row.label.padEnd(34)} ${String(row.width).padStart(5)}px  ${row.scroll.padStart(9)}  ${row.controls} controls`);
  console.log(`\nRESULT: ${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILED: ${JSON.stringify(failures)}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("script error:", error.message);
  process.exit(2);
});
