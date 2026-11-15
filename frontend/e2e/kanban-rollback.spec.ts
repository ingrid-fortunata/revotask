import { test, expect, type Page } from "@playwright/test";
import { emailFor, runFromEnv, storageFor, titleFor } from "./support/run";
import { tokenFromStorage } from "./support/api";
import { addCard, addColumn, addMember, createBoard, getBoard, cardColumn, columnIdByName } from "./support/seed";

// LA-6 (V05). LA-6a uses a real stale version from a second session (no interception).
// LA-6b forces a 500 and LA-6c forwards the request and then aborts it (uncertain outcome).
// Interception is used only in those two cases, and each test says which one it used.
const run = runFromEnv();
const ownerToken = () => tokenFromStorage(storageFor("owner"));
test.use({ storageState: storageFor("owner") });

async function seed(): Promise<{ boardId: string; cardTitle: string; sourceId: string; destId: string; name: string }> {
  const token = ownerToken();
  const name = titleFor(run.runId, "board", `rollback ${Date.now()}`);
  const boardId = await createBoard(token, name);
  const sourceId = await addColumn(token, boardId, "Source");
  await addColumn(token, boardId, "Destination");
  const board = await getBoard(token, boardId);
  const destId = columnIdByName(board, "Destination");
  await addMember(token, boardId, emailFor(run.runId, "member"));
  const cardTitle = titleFor(run.runId, "card", "rollback");
  await addCard(token, sourceId, cardTitle);
  return { boardId, cardTitle, sourceId, destId, name };
}

async function moveToDestination(page: Page, card: string): Promise<void> {
  await page.getByRole("button", { name: `Move ${card}` }).click();
  const dialog = page.getByRole("dialog", { name: "Move card" });
  await dialog.getByLabel("Column").selectOption({ label: "Destination" });
  await dialog.getByRole("button", { name: "Move card" }).click();
}

test("stale version shows 409 and refetches (interception: none)", async ({ page, browser }) => {
  const s = await seed();
  await page.goto(`/boards/${s.boardId}`);
  const memberContext = await browser.newContext({ storageState: storageFor("member") });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(`/boards/${s.boardId}`);
  await moveToDestination(memberPage, s.cardTitle);            // second session moves first
  await expect(memberPage.getByRole("button", { name: `Open ${s.cardTitle}` })).toBeVisible();
  await memberContext.close();

  await moveToDestination(page, s.cardTitle);                  // stale version from the owner's page
  await expect(page.getByText(/changed|refresh|conflict/i).first()).toBeVisible();
  expect(cardColumn(await getBoard(ownerToken(), s.boardId), s.cardTitle)).toBe("Destination");
});

test("forced 500 restores prior order (interception: fulfill 500) @desktop", async ({ page }) => {
  const s = await seed();
  await page.route("**/api/cards/*/position", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }),
    }),
  );
  await page.goto(`/boards/${s.boardId}`);
  await moveToDestination(page, s.cardTitle);
  await expect(page.getByText(/couldn.t|failed|try again/i).first()).toBeVisible();
  expect(cardColumn(await getBoard(ownerToken(), s.boardId), s.cardTitle)).toBe("Source");
});

test("uncertain outcome refetches the canonical board (interception: forward then abort) @desktop", async ({ page }) => {
  const s = await seed();
  const before = (await getBoard(ownerToken(), s.boardId)) as unknown as { position_version: number };
  await page.route("**/api/cards/*/position", async (route) => {
    await route.fetch();                                      // the server commits the move
    await route.abort("timedout");                            // the browser never sees the response
  });
  await page.goto(`/boards/${s.boardId}`);
  await moveToDestination(page, s.cardTitle);
  await expect(page.getByRole("button", { name: `Open ${s.cardTitle}` })).toBeVisible();
  const after = (await getBoard(ownerToken(), s.boardId)) as unknown as { position_version: number };
  expect(cardColumn(after as never, s.cardTitle)).toBe("Destination");
  expect(after.position_version - before.position_version).toBe(1);
});

