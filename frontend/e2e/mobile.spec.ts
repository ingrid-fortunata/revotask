import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runFromEnv, storageFor, titleFor } from "./support/run";
import { tokenFromStorage } from "./support/api";
import { addCard, addColumn, createBoard } from "./support/seed";
import { openCardUi } from "./support/ui";

// LA-8 (V11): every route and dialog at the project width. Pass when the page has no horizontal
// overflow, every visible control is at least 44 x 44 CSS px, and every text input is at least 16 px.
// Each result is appended to evidence/local-acceptance-T15-mobile.json with its project and viewport.
const run = runFromEnv();
const EVIDENCE = path.resolve("../evidence/local-acceptance-T15-mobile.json");

type Audit = { overflow: number; small: string[]; smallInputs: string[] };

async function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"]');
    };
    const doc = document.documentElement;
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]'))) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 60);
        small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    const smallInputs: string[] = [];
    for (const el of Array.from(document.querySelectorAll("input, textarea, select"))) {
      const type = (el as HTMLInputElement).type;
      if (["checkbox", "radio", "hidden", "submit", "button"].includes(type) || !visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 16) smallInputs.push(`${el.getAttribute("name") || el.id || el.tagName} ${size}px`);
    }
    return { overflow: doc.scrollWidth - doc.clientWidth, small, smallInputs };
  });
}

function record(project: string, viewport: string, label: string, result: Audit & { pass: boolean }) {
  const rows = existsSync(EVIDENCE) ? (JSON.parse(readFileSync(EVIDENCE, "utf8")) as unknown[]) : [];
  rows.push({ project, viewport, browser: "Chromium", input: /touch/.test(project) || project.startsWith("viewport") || project === "mobile-375" ? "touch emulation" : "mouse and keyboard", label, ...result });
  mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  writeFileSync(EVIDENCE, JSON.stringify(rows, null, 2) + "\n");
}

async function check(page: Page, testInfo: { project: { name: string; use: { viewport?: { width: number; height: number } | null } } }, label: string) {
  const result = await audit(page);
  const pass = result.overflow <= 0 && result.small.length === 0 && result.smallInputs.length === 0;
  const viewport = testInfo.project.use.viewport ? `${testInfo.project.use.viewport.width}x${testInfo.project.use.viewport.height}` : "";
  record(testInfo.project.name, viewport, label, { ...result, pass });
  expect(result.overflow, `${label}: horizontal overflow ${result.overflow}px`).toBeLessThanOrEqual(0);
  expect(result.small, `${label}: small targets`).toEqual([]);
  expect(result.smallInputs, `${label}: small inputs`).toEqual([]);
}

test.describe("anonymous routes @matrix", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const route of ["/login", "/register"]) {
    test(`route ${route} @matrix`, async ({ page }, testInfo) => {
      await page.goto(route);
      await check(page, testInfo, route);
    });
  }
});

test.describe("signed-in routes and dialogs @matrix", () => {
  test.use({ storageState: storageFor("owner") });
  let boardId = "";
  let cardTitle = "";

  test.beforeAll(async () => {
    const token = tokenFromStorage(storageFor("owner"));
    boardId = await createBoard(token, titleFor(run.runId, "board", "matrix"));
    const columnId = await addColumn(token, boardId, "Todo");
    cardTitle = titleFor(run.runId, "card", "matrix");
    await addCard(token, columnId, cardTitle);
  });

  for (const route of ["/", "/my-tasks", "/profile"]) {
    test(`route ${route} @matrix`, async ({ page }, testInfo) => {
      await page.goto(route);
      await check(page, testInfo, route);
    });
  }

  test("route /boards/[id] and its Move control @matrix", async ({ page }, testInfo) => {
    await page.goto(`/boards/${boardId}`);
    await check(page, testInfo, "/boards/[id]");
    await expect(page.getByRole("button", { name: `Move ${cardTitle}` })).toBeVisible();
  });

  test("dialog: Card details @matrix", async ({ page }, testInfo) => {
    await page.goto(`/boards/${boardId}`);
    await openCardUi(page, cardTitle);
    await check(page, testInfo, "dialog Card details");
    await page.getByRole("button", { name: "Close card details" }).click();
  });

  test("dialog: Move card @matrix", async ({ page }, testInfo) => {
    await page.goto(`/boards/${boardId}`);
    await page.getByRole("button", { name: `Move ${cardTitle}` }).click();
    await page.getByRole("dialog", { name: "Move card" });
    await check(page, testInfo, "dialog Move card");
    await page.keyboard.press("Escape");
  });
});
