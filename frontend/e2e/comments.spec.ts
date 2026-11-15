import { test, expect } from "@playwright/test";
import { emailFor, runFromEnv, storageFor, titleFor } from "./support/run";
import { dataOf, flask, tokenFromStorage } from "./support/api";
import { addCard, addColumn, addMember, createBoard } from "./support/seed";
import { openCardUi } from "./support/ui";

// LA-5: comments journey for the owner, then the second user cannot edit or delete the author's comment.
const run = runFromEnv();
test.use({ storageState: storageFor("owner") });

async function seedCard(): Promise<{ boardId: string; cardTitle: string }> {
  const token = tokenFromStorage(storageFor("owner"));
  const boardId = await createBoard(token, titleFor(run.runId, "board", "comments"));
  const columnId = await addColumn(token, boardId, "Todo");
  await addMember(token, boardId, emailFor(run.runId, "member"));
  const cardTitle = titleFor(run.runId, "card", "comments");
  await addCard(token, columnId, cardTitle);
  return { boardId, cardTitle };
}

test("add, edit, delete a comment, then reload (owner) @desktop", async ({ page }) => {
  const { boardId, cardTitle } = await seedCard();
  await page.goto(`/boards/${boardId}`);
  const dialog = await openCardUi(page, cardTitle);

  const text = `LA ${run.runId} first comment`;
  await dialog.getByLabel("Add a comment").fill(text);
  await dialog.getByRole("button", { name: "Add comment" }).click();
  await expect(dialog.getByText(text)).toBeVisible();

  await dialog.getByRole("button", { name: /^Edit your comment from/ }).click();
  const edited = `${text} edited`;
  await dialog.getByLabel("Edit your comment").fill(edited);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText(edited)).toBeVisible();

  await dialog.getByRole("button", { name: /^Delete your comment from/ }).click();
  await page.getByRole("dialog", { name: "Delete comment?" }).getByRole("button", { name: "Delete comment" }).click();
  await expect(dialog.getByText(edited)).toHaveCount(0);

  await page.reload();
  await openCardUi(page, cardTitle);
  await expect(page.getByRole("dialog", { name: "Card details" }).getByText(edited)).toHaveCount(0);
});

test("a second user cannot edit or delete the author's comment @desktop", async ({ page, browser }) => {
  const { boardId, cardTitle } = await seedCard();
  const ownerTok = tokenFromStorage(storageFor("owner"));
  const memberTok = tokenFromStorage(storageFor("member"));
  const cardId = await cardIdByTitle(ownerTok, boardId, cardTitle);
  const posted = await flask("POST", `/api/cards/${cardId}/comments`, { token: ownerTok, body: { content: `LA ${run.runId} by owner` } });
  expect(posted.status).toBe(201);
  const commentId = dataOf<{ id: string }>(posted.json).id;

  const memberContext = await browser.newContext({ storageState: storageFor("member") });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(`/boards/${boardId}`);
  const dialog = await openCardUi(memberPage, cardTitle);
  await expect(dialog.getByText(`LA ${run.runId} by owner`)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Edit your comment from/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^Delete your comment from/ })).toHaveCount(0);
  await memberContext.close();

  expect((await flask("PATCH", `/api/comments/${commentId}`, { token: memberTok, body: { content: "x" } })).status).toBe(403);
  expect((await flask("DELETE", `/api/comments/${commentId}`, { token: memberTok })).status).toBe(403);
  void page;
});

async function cardIdByTitle(token: string, boardId: string, title: string): Promise<string> {
  const reply = await flask("GET", `/api/boards/${boardId}`, { token });
  for (const column of dataOf<{ columns: { cards: { id: string; title: string }[] }[] }>(reply.json).columns) {
    const card = column.cards.find((c) => c.title === title);
    if (card) return card.id;
  }
  throw new Error("card not found");
}
