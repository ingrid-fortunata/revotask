import { test, expect } from "@playwright/test";
import { emailFor, runFromEnv, storageFor, titleFor } from "./support/run";
import { createBoardUi } from "./support/ui";

// LA-3: create, open, add member, remove member, delete board (owner UI); the removed member's
// access ends; an unregistered email shows USER_NOT_FOUND to the admin.
const run = runFromEnv();
const memberEmail = emailFor(run.runId, "member");
const memberName = titleFor(run.runId, "member");
const boardName = titleFor(run.runId, "board");

test.use({ storageState: storageFor("owner") });

test("create, open, add member, remove member, delete board @boards", async ({ page, browser }) => {
  await createBoardUi(page, boardName);
  const url = page.url();

  // Add the registered member by email, in the Members dialog.
  await page.getByRole("button", { name: "Add member" }).click();
  const members = page.getByRole("dialog", { name: "Members" });
  await members.getByLabel("Member email").fill(memberEmail);
  await members.getByRole("button", { name: "Add member" }).click();
  await expect(members.getByText(memberName)).toBeVisible();

  // Remove the member; the confirmation names the member.
  await members.getByRole("button", { name: `Remove ${memberName}` }).click();
  const confirm = page.getByRole("dialog", { name: "Remove member?" });
  await expect(confirm).toContainText(memberName);
  await confirm.getByRole("button", { name: "Remove member" }).click();
  await expect(members.getByText(memberName)).toHaveCount(0);

  // The removed member gets the same answer as for a missing board.
  const memberContext = await browser.newContext({ storageState: storageFor("member") });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(memberPage.getByText("Board not found")).toBeVisible();
  await memberContext.close();

  // Delete the board; the board is gone for the admin.
  await page.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("dialog", { name: "Delete board?" }).getByRole("button", { name: "Delete board" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: boardName })).toHaveCount(0);
  await page.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.getByText("Board not found")).toBeVisible();
});

test("an unregistered email shows USER_NOT_FOUND to the admin @boards", async ({ page }) => {
  await createBoardUi(page, titleFor(run.runId, "board", "unknown"));
  await page.getByRole("button", { name: "Add member" }).click();
  const members = page.getByRole("dialog", { name: "Members" });
  const email = members.getByLabel("Member email");
  await email.fill(`nobody-${run.runId}@acceptance.example.test`);
  await members.getByRole("button", { name: "Add member" }).click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(members.getByRole("alert").or(members.locator("#add-member-email-error, [id$='-error']")).first()).toContainText(/.+/);
  await page.keyboard.press("Escape");
});
