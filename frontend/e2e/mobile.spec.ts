import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runFromEnv, storageFor, titleFor } from "./support/run";
import { tokenFromStorage } from "./support/api";
import { addCard, addColumn, createBoard } from "./support/seed";

// LA-8 (V11): every route and dialog at the project width. Pass when the page has no horizontal
// overflow, every visible control is at least 44 x 44 CSS px, and every text input is at least 16 px.
// Each result is appended to evidence/local-acceptance-T15-mobile.json with its project and viewport.
const run = runFromEnv();
const EVIDENCE = path.resolve("../evidence/local-acceptance-T15-mobile.json");

type Audit = { overflow: number; small: string[]; smallInputs: string[] };

async function audit(page: Page, scoped: boolean): Promise<Audit> {
  return page.evaluate((scoped) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"]');
    };
    const doc = document.documentElement;
    // With a dialog open, only the dialog is audited. The page behind it is inert and is audited by its route row.
    const root: ParentNode = (scoped && document.querySelector("dialog[open]")) || document;
    const small: string[] = [];
    for (const el of Array.from(root.querySelectorAll('a[href], button, input, select, textarea, [role="button"]'))) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 60);
        small.push(`${label} ${r.width.toFixed(2)}x${r.height.toFixed(2)}`);
      }
    }
    const smallInputs: string[] = [];
    for (const el of Array.from(root.querySelectorAll("input, textarea, select"))) {
      const type = (el as HTMLInputElement).type;
      if (["checkbox", "radio", "hidden", "submit", "button"].includes(type) || !visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 16) smallInputs.push(`${el.getAttribute("name") || el.id || el.tagName} ${size}px`);
    }
    return { overflow: doc.scrollWidth - doc.clientWidth, small, smallInputs };
  }, scoped);
}

function record(project: string, viewport: string, label: string, result: Audit & { pass: boolean }) {
  const all = existsSync(EVIDENCE) ? (JSON.parse(readFileSync(EVIDENCE, "utf8")) as { project: string; label: string }[]) : [];
  const rows: unknown[] = all.filter((r) => !(r.project === project && r.label === label)); // one row per case: the latest run replaces an older one
  rows.push({ project, viewport, browser: "Chromium", input: /touch/.test(project) || project.startsWith("viewport") || project === "mobile-375" ? "touch emulation" : "mouse and keyboard", label, ...result });
  mkdirSync(path.dirname(EVIDENCE), { recursive: true });
  writeFileSync(EVIDENCE, JSON.stringify(rows, null, 2) + "\n");
}

type Info = { project: { name: string; use: { viewport?: { width: number; height: number } | null } } };

// The modal opens with a scale transition, so a box read at once is a little smaller than its final
// size. Wait until the dialog (or the page, with none open) keeps the same box for 10 frames in a row.
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const el = document.querySelector("dialog[open] > *") ?? document.body;
        let last = "";
        let same = 0;
        const tick = () => {
          const r = el.getBoundingClientRect();
          const now = `${r.width.toFixed(2)}x${r.height.toFixed(2)}`;
          same = now === last ? same + 1 : 0;
          last = now;
          if (same >= 10) resolve();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

async function check(page: Page, testInfo: Info, label: string, scoped = false) {
  await settled(page);
  let result = await audit(page, scoped);
  if (result.small.length > 0) {
    // One re-measure: a box read while the dialog content was still loading can be a fraction short.
    await settled(page);
    result = await audit(page, scoped);
  }
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

  // Each dialog: open, audit the dialog alone, close with Escape, and focus returns to the trigger (task 10.2).
  async function dialogCheck(page: Page, testInfo: Info, label: string, trigger: Locator) {
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check(page, testInfo, `dialog ${label}`, true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }

  test("dialog: Card details @matrix", async ({ page }, testInfo) => {
    await page.goto(`/boards/${boardId}`);
    await dialogCheck(page, testInfo, "Card details", page.getByRole("button", { name: `Open ${cardTitle}` }));
  });

  test("dialog: Move card @matrix", async ({ page }, testInfo) => {
    await page.goto(`/boards/${boardId}`);
    await dialogCheck(page, testInfo, "Move card", page.getByRole("button", { name: `Move ${cardTitle}` }));
  });

  test("dialog: board analytics @matrix", async ({ page }, testInfo) => {
    await page.goto(`/boards/${boardId}`);
    await dialogCheck(page, testInfo, "Analytics", page.getByRole("button", { name: "Analytics" }));
  });

  test("dialog: notification bell panel @matrix", async ({ page }, testInfo) => {
    await page.goto("/");
    await dialogCheck(page, testInfo, "Notifications", page.getByRole("button", { name: /^Notifications/ }));
  });
});
