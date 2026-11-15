import { test, expect } from "@playwright/test";
import { emailFor, runFromEnv, storageFor, titleFor } from "./support/run";
import { tokenFromStorage } from "./support/api";
import { addCardUi, addColumnUi, createBoardUi, openCardUi } from "./support/ui";
import { addMember, boardIdByName, cardColumn, columnIdByName, getBoard } from "./support/seed";

// LA-4 (V10): the eight-step journey on desktop, and the Move-button core flow at 375 px (touch).
const run = runFromEnv();
const ownerToken = () => tokenFromStorage(storageFor("owner"));

test.use({ storageState: storageFor("owner") });

test("eight-step journey with dragTo and reload @desktop", async ({ page }) => {
  const board = titleFor(run.runId, "board", "drag");
  const card = titleFor(run.runId, "card", "drag");
  await createBoardUi(page, board);                             // 1. unique board
  await addColumnUi(page, "Source");                            // 2. two columns
  await addColumnUi(page, "Destination");
  const token = ownerToken();
  await addMember(token, await boardIdByName(token, board), emailFor(run.runId, "member"));
  await addCardUi(page, "Source", card);                        // 3. card in source

  const dialog = await openCardUi(page, card);                  // 4. open details
  await dialog.getByLabel("Assignee").selectOption({ label: titleFor(run.runId, "member") });
  await dialog.getByRole("button", { name: "Save" }).click();   // edit and assign
  await page.getByRole("button", { name: "Close card details" }).click();

  const boardId = await boardIdByName(token, board);
  const before = await getBoard(token, boardId);
  const destination = columnIdByName(before, "Destination");

  // 6. desktop drag: source is the card's open control, target is the destination's end drop zone
  await page.getByRole("button", { name: `Open ${card}` }).dragTo(page.getByTestId(`dropzone-${destination}-end`));

  // 7. reload: card in destination, absent from source
  await page.reload();
  expect(cardColumn(await getBoard(token, boardId), card)).toBe("Destination");
  await expect(page.getByRole("button", { name: `Open ${card}` })).toBeVisible();

  // 8. delete the card (comment edit and delete are in comments.spec)
  await page.getByRole("button", { name: `Open ${card}` }).click();
  const details = page.getByRole("dialog", { name: "Card details" });
  await details.getByRole("button", { name: "Delete card" }).click();
  await page.getByRole("dialog", { name: "Delete card?" }).getByRole("button", { name: "Delete card" }).click();
  await expect(page.getByRole("button", { name: `Open ${card}` })).toHaveCount(0);
});

test("core flow with Move button at 375 px @touch-only", async ({ page }) => {
  const board = titleFor(run.runId, "board", "move");
  const card = titleFor(run.runId, "card", "move");
  await createBoardUi(page, board);
  await addColumnUi(page, "Source");
  await addColumnUi(page, "Destination");
  await addCardUi(page, "Source", card);

  await page.getByRole("button", { name: `Move ${card}` }).click();
  const dialog = page.getByRole("dialog", { name: "Move card" });
  await dialog.getByLabel("Column").selectOption({ label: "Destination" });
  await dialog.getByRole("button", { name: "Move card" }).click();
  await page.reload();
  const token = ownerToken();
  expect(cardColumn(await getBoard(token, await boardIdByName(token, board)), card)).toBe("Destination");
});
