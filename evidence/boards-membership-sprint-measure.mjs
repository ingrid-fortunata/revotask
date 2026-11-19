// Real-browser check for boards-membership Revision 2, the sprint date range (Requirements 8.10 to
// 8.14, 9.6 to 9.8; tasks 15.1 and 15.2).
//
// Drives Chromium through Playwright (already a dev dependency of the frontend) with device
// emulation below 1024 px. It is an emulator, not a real phone, and the report says so. The stack must
// already be running: this script starts no server. It seeds its own throwaway accounts through the
// Flask API (an admin and a member), so it needs no pre-made accounts. Run it against a test database:
// users cannot be deleted through the API.
//
//   BASE_URL=http://localhost:3101 API_URL=http://127.0.0.1:5002 \
//   REPORT_FILE=evidence/boards-membership-sprint-mobile.json \
//   SHOT_DIR=evidence/boards-membership-sprint-screenshots \
//   node evidence/boards-membership-sprint-measure.mjs
//
// Environment variables
//   BASE_URL     Next.js origin (required)
//   API_URL      Flask origin, used only to seed and to read stored values (required)
//   REPORT_FILE  also write the JSON report to this path (optional)
//   SHOT_DIR     write PNG screenshots at 375, 768 and 1280 px here (optional)
//
// Throwaway accounts use emails of the form sp-<hex>@sprint-check.example.test. The report never
// contains a password, an email, a token or a cookie. For each width it checks: no horizontal page
// scroll, every control at least 44 by 44 CSS px (elementFromPoint at its center), every text and date
// input at 16 px or more, and the behavior of the create form, the sprint line, the edit form and
// the analytics dialog. Exit code 1 when any check fails.
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

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
const WIDTHS = [320, 375, 768, 1280];
const SHOT_WIDTHS = [375, 768, 1280];
const SHOT_DIR = process.env.SHOT_DIR;
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

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
const ADMIN = { email: `sp-admin-${SUFFIX}@sprint-check.example.test`, name: "Sprint Admin" };
const MEMBER = { email: `sp-member-${SUFFIX}@sprint-check.example.test`, name: "Sprint Member" };
const SPRINT = { sprint_start: "2026-11-16", sprint_end: "2026-11-22" };

async function api(method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")} -> ${response.status}`);
  return json?.data;
}

const world = {};
async function seed() {
  for (const user of [ADMIN, MEMBER]) {
    await api("POST", "/api/auth/register", null, { name: user.name, email: user.email, password: PASSWORD });
  }
  const login = async (user) =>
    (await api("POST", "/api/auth/login", null, { email: user.email, password: PASSWORD })).access_token;
  world.adminToken = await login(ADMIN);
  const make = async (name, sprint) => {
    const board = await api("POST", "/api/boards", world.adminToken, { name, ...sprint });
    await api("POST", `/api/boards/${board.id}/members`, world.adminToken, { email: MEMBER.email });
    const todo = (await api("POST", `/api/boards/${board.id}/columns`, world.adminToken, { name: "Todo" })).column.id;
    const done = (await api("POST", `/api/boards/${board.id}/columns`, world.adminToken, { name: "Done", is_done: true })).column.id;
    await api("POST", `/api/columns/${todo}/cards`, world.adminToken, { title: "Plan" });
    await api("POST", `/api/columns/${done}/cards`, world.adminToken, { title: "Ship" });
    return board.id;
  };
  world.sprintBoard = await make(`Sprint board ${SUFFIX}`, SPRINT);
  world.weekBoard = await make(`Week board ${SUFFIX}`, {});
}
const stored = (id) => api("GET", `/api/boards/${id}`, world.adminToken);
const storedAnalytics = (id) => api("GET", `/api/boards/${id}/analytics`, world.adminToken);

// ---- page helpers --------------------------------------------------------------------------
const MEASURE = (scopeSelector) => {
  const scope = scopeSelector ? document.querySelector(scopeSelector) : document;
  if (!scope) return { missing: true };
  const selector = "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], summary";
  const controls = [];
  for (const el of scope.querySelectorAll(selector)) {
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const tag = el.tagName.toLowerCase();
    const name = el.id ? `${tag}#${el.id}` : `${tag} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}`;
    controls.push({
      name,
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
      hitOk: !!hit && (hit === el || el.contains(hit)),
      fontSize: parseFloat(style.fontSize),
      isTextInput: tag === "input" && !["button", "submit", "checkbox", "radio", "hidden"].includes(el.type),
    });
  }
  window.scrollTo(0, 0);
  return { docScroll: document.documentElement.scrollWidth, innerWidth: window.innerWidth, controls };
};

async function measure(page, role, name, width, scope = null) {
  const m = await page.evaluate(MEASURE, scope);
  if (m.missing) return record(role, name, width, "measured scope is present", false);
  record(role, name, width, "no horizontal page scroll", m.docScroll <= m.innerWidth, `scrollWidth ${m.docScroll}, innerWidth ${m.innerWidth}`);
  const small = m.controls.filter((c) => c.width < 44 || c.height < 44);
  record(role, name, width, "every control is at least 44 by 44 CSS px", small.length === 0, small.map((c) => `${c.name} ${c.width}x${c.height}`).join("; "));
  const unreachable = m.controls.filter((c) => !c.hitOk);
  record(role, name, width, "elementFromPoint at each center hits the control", unreachable.length === 0, unreachable.map((c) => c.name).join("; "));
  const textInputs = m.controls.filter((c) => c.isTextInput);
  const smallText = textInputs.filter((c) => c.fontSize < 16);
  record(role, name, width, "every text and date input is at least 16 px", smallText.length === 0, smallText.map((c) => `${c.name} ${c.fontSize}px`).join("; "));
  return m;
}

async function settle(page) {
  // The dialog animates in. Wait until its box stops moving, with a hard bound.
  let last = "";
  for (let i = 0; i < 30; i += 1) {
    const now = await page.evaluate(() => {
      const d = document.querySelector("dialog[open] .modal-box") || document.querySelector("dialog[open]");
      if (!d) return "";
      const r = d.getBoundingClientRect();
      return JSON.stringify([r.left, r.top, r.width, r.height, getComputedStyle(d).scale]);
    });
    if (now && now === last) return true;
    last = now;
    await page.waitForTimeout(100);
  }
  return false;
}

async function shot(page, name, width) {
  if (SHOT_DIR && SHOT_WIDTHS.includes(width)) {
    await page.screenshot({ path: `${SHOT_DIR}/${name}-${width}.png`, fullPage: false });
  }
}

async function signIn(page, user) {
  await page.goto(`${ORIGIN}/login`);
  await page.fill("#login-email", user.email);
  await page.fill("#login-password", PASSWORD);
  await page.evaluate(() => document.querySelector("form").requestSubmit());
  await page.waitForFunction(() => location.pathname === "/" && document.body.innerText.includes("Sign out"));
}

const sprintLine = (page) => page.getByText(/^Sprint \d{1,2} \w{3}( \d{4})? to \d{1,2} \w{3}( \d{4})?$/);

// ---- one width -----------------------------------------------------------------------------
async function runWidth(browser, width) {
  const mobile = width < 1024;
  const context = await browser.newContext({
    viewport: { width, height: mobile ? 812 : 800 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const posts = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/boards")) posts.push(request.url());
  });
  try {
    await signIn(page, ADMIN);

    // 1. The create form on the dashboard (Requirements 8.10, 8.11, 8.14).
    await page.goto(`${ORIGIN}/`);
    await page.getByRole("button", { name: /Create board/ }).first().click();
    await page.waitForSelector("dialog[open]");
    await settle(page);
    const dialog = page.locator("dialog[open]");
    record("admin", "/ create dialog", width, "date fields are native date inputs with labels", (await dialog.getByLabel("Sprint start").getAttribute("type")) === "date" && (await dialog.getByLabel("Sprint end").getAttribute("type")) === "date");
    await measure(page, "admin", "/ create dialog", width, "dialog[open]");
    await shot(page, "create-board", width);

    const before = posts.length;
    await dialog.getByLabel("Board name").fill(`Sprint create ${width} ${SUFFIX}`);
    await dialog.getByLabel("Sprint start").fill("2026-11-16");
    await dialog.getByRole("button", { name: "Create board" }).click();
    record("admin", "/ create dialog", width, "one date only shows its error and sends no request", (await dialog.getByText("Enter both sprint dates.").isVisible()) && posts.length === before);
    await dialog.getByLabel("Sprint end").fill("2026-11-10");
    await dialog.getByRole("button", { name: "Create board" }).click();
    record("admin", "/ create dialog", width, "an end before the start shows its error and sends no request", (await dialog.getByText("Must be on or after the start date.").isVisible()) && posts.length === before);
    await dialog.getByLabel("Sprint end").fill("2026-11-22");
    await dialog.getByRole("button", { name: "Create board" }).click();
    await page.waitForURL(/\/boards\/[0-9a-f-]{36}$/);
    const createdId = page.url().split("/").pop();
    const createdStored = await stored(createdId);
    record("admin", "/ create dialog", width, "the created board stores the entered sprint", createdStored.sprint_start === "2026-11-16" && createdStored.sprint_end === "2026-11-22");

    // 2. The board page, its sprint line and the edit form (Requirements 8.12, 8.13).
    await page.getByRole("heading", { level: 1 }).waitFor();
    record("admin", "/boards/:id", width, "the header shows the sprint line without a time", (await sprintLine(page).count()) === 1 && !/\d:\d\d/.test(await sprintLine(page).innerText()));
    await measure(page, "admin", "/boards/:id", width);
    await shot(page, "board-with-sprint", width);

    await page.getByRole("button", { name: "Edit board" }).click();
    await page.waitForSelector("form[aria-label='Edit board']");
    record("admin", "/boards/:id edit form", width, "the date fields are prefilled and Clear dates is offered", (await page.getByLabel("Sprint start").inputValue()) === "2026-11-16" && (await page.getByLabel("Sprint end").inputValue()) === "2026-11-22" && (await page.getByRole("button", { name: "Clear dates" }).count()) === 1);
    await measure(page, "admin", "/boards/:id edit form", width);
    await shot(page, "edit-board", width);

    await page.getByLabel("Sprint end").fill("2026-11-10");
    await page.getByRole("button", { name: "Save changes" }).click();
    record("admin", "/boards/:id edit form", width, "an end before the start shows its error and keeps the stored sprint", (await page.getByText("Must be on or after the start date.").isVisible()) && (await stored(createdId)).sprint_end === "2026-11-22");
    await page.getByLabel("Sprint start").fill("2026-12-01");
    await page.getByLabel("Sprint end").fill("2026-12-07");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText(/^Sprint 1 Dec( \d{4})? to 7 Dec( \d{4})?$/).waitFor();
    const edited = await stored(createdId);
    record("admin", "/boards/:id", width, "saving new dates updates the line without a reload and stores them", edited.sprint_start === "2026-12-01" && edited.sprint_end === "2026-12-07" && edited.name === `Sprint create ${width} ${SUFFIX}`);

    await page.getByRole("button", { name: "Edit board" }).click();
    await page.getByRole("button", { name: "Clear dates" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForFunction(() => !/Sprint \d/.test(document.body.innerText));
    const cleared = await stored(createdId);
    record("admin", "/boards/:id", width, "Clear dates then save removes the line and stores both nulls", cleared.sprint_start === null && cleared.sprint_end === null);

    // 3. The analytics dialog for a board with a sprint (Requirements 9.6, 9.7).
    await page.goto(`${ORIGIN}/boards/${world.sprintBoard}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.getByRole("button", { name: "Analytics" }).click();
    await page.waitForSelector("dialog[open]");
    await page.getByText("Cards completed this sprint").waitFor();
    await settle(page);
    const sprintData = await storedAnalytics(world.sprintBoard);
    record("admin", "analytics dialog (sprint)", width, "E29 answers the sprint window", sprintData.window === "sprint" && sprintData.week_start === "2026-11-16T00:00:00Z" && sprintData.week_end === "2026-11-23T00:00:00Z");
    const dialogText = await page.locator("dialog[open]").innerText();
    record("admin", "analytics dialog (sprint)", width, "the line is 'Sprint ... to ...' with no time, and the labels say sprint", /Sprint 16 Nov( 2026)? to 22 Nov( 2026)?/.test(dialogText) && !/local time|\d\d:\d\d/.test(dialogText) && dialogText.includes("Activity this sprint") && !/this week/.test(dialogText));
    await measure(page, "admin", "analytics dialog (sprint)", width, "dialog[open]");
    await shot(page, "analytics-sprint", width);
    await page.keyboard.press("Escape");

    // 4. A board without a sprint keeps the week line (Requirement 9.2).
    await page.goto(`${ORIGIN}/boards/${world.weekBoard}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    record("admin", "/boards/:id (no sprint)", width, "no sprint line is shown", (await sprintLine(page).count()) === 0);
    await page.getByRole("button", { name: "Analytics" }).click();
    await page.getByText("Cards completed this week").waitFor();
    const weekText = await page.locator("dialog[open]").innerText();
    record("admin", "analytics dialog (week)", width, "the week line and week labels are kept", /Week of \d{1,2} \w{3}, \d\d:\d\d to \d{1,2} \w{3}, \d\d:\d\d \(local time\)/.test(weekText) && weekText.includes("Activity this week"));
    await shot(page, "analytics-week", width);
    await page.keyboard.press("Escape");

    // 5. A member sees the sprint but no edit control (Requirement 8.13).
    const memberContext = await browser.newContext({ viewport: { width, height: mobile ? 812 : 800 }, isMobile: mobile, hasTouch: mobile });
    const memberPage = await memberContext.newPage();
    try {
      await signIn(memberPage, MEMBER);
      await memberPage.goto(`${ORIGIN}/boards/${world.sprintBoard}`);
      await memberPage.getByRole("heading", { level: 1 }).waitFor();
      record("member", "/boards/:id", width, "the member sees the sprint line", (await sprintLine(memberPage).count()) === 1);
      record("member", "/boards/:id", width, "the member sees no Edit board button and no date field", (await memberPage.getByRole("button", { name: "Edit board" }).count()) === 0 && (await memberPage.getByLabel("Sprint start").count()) === 0);
      await measure(memberPage, "member", "/boards/:id", width);
    } finally {
      await memberContext.close();
    }
  } catch (error) {
    record("harness", "run", width, "the width completes", false, String(error.message).split("\n")[0].slice(0, 200));
  } finally {
    await context.close();
  }
}

// ---- run and report ------------------------------------------------------------------------
async function main() {
  await seed();
  const browser = await chromium.launch();
  const version = browser.version();
  try {
    for (const width of WIDTHS) {
      console.error(`width ${width}`);
      await runWidth(browser, width);
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  const report = {
    check: "boards-membership Revision 2, sprint date range (tasks 15.1, 15.2)",
    browser: `Chromium ${version} through Playwright, device emulation below 1024 px (an emulator, not a real phone)`,
    widths: WIDTHS,
    total: results.length,
    failed: failed.length,
    results,
  };
  const text = JSON.stringify(report, null, 2);
  for (const secret of [PASSWORD, ADMIN.email, MEMBER.email, world.adminToken]) {
    if (secret && text.includes(secret)) {
      console.error("refusing to print a report that contains a secret");
      process.exit(3);
    }
  }
  if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, `${text}\n`);
  console.log(text);
  console.error(`${results.length} checks, ${failed.length} failed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`harness error: ${String(error.message).split("\n")[0]}`);
  process.exit(2);
});
