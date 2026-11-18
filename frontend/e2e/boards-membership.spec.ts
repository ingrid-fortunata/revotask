import { test, expect } from "@playwright/test";
import { emailFor, runFromEnv, storageFor, titleFor } from "./support/run";
import { createBoardUi } from "./support/ui";

// The year is part of the sprint text only when a date is not in the current year, so the matches
// below accept both forms ("Sprint 16 Nov to 22 Nov" or "Sprint 16 Nov 2026 to 22 Nov 2026").
const sprintText = (from: string, to: string) => new RegExp(`^Sprint ${from}( \\d{4})? to ${to}( \\d{4})?$`);

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

// LA-3 (sprint date range, boards-membership Revision 2): set a sprint when creating a board, see it
// in the header and in analytics, change it, clear it, and see that a member cannot. Dates are fixed
// calendar dates, so nothing depends on the day the suite runs.
test("sprint dates: create, show, edit, clear, member read-only @boards @matrix", async ({ page, browser }) => {
  const name = titleFor(run.runId, "board", "sprint");

  // Create: one date only and an end before the start are refused in the dialog, with no navigation.
  await page.goto("/");
  await page.getByRole("button", { name: "Create board" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a board" });
  await dialog.getByLabel("Board name").fill(name);
  await dialog.getByLabel("Sprint start").fill("2026-11-16");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(dialog.getByText("Enter both sprint dates.")).toBeVisible();
  await dialog.getByLabel("Sprint end").fill("2026-11-10");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(dialog.getByText("Must be on or after the start date.")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await dialog.getByLabel("Sprint end").fill("2026-11-22");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const path = page.url().replace(/^https?:\/\/[^/]+/, "");

  // The header shows the sprint, with no time. It survives a reload (it is stored).
  await expect(page.getByText(sprintText("16 Nov", "22 Nov"))).toBeVisible();
  await page.reload();
  await expect(page.getByText(sprintText("16 Nov", "22 Nov"))).toBeVisible();

  // Analytics follows the sprint: the sprint line and sprint labels, not the week.
  await page.getByRole("button", { name: "Analytics" }).click();
  const analytics = page.getByRole("dialog", { name: "Analytics" });
  await expect(analytics.getByText(sprintText("16 Nov", "22 Nov"))).toBeVisible();
  await expect(analytics.getByText("Cards completed this sprint")).toBeVisible();
  await expect(analytics.getByText(/local time/)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // A member sees the sprint and has no way to edit it.
  await page.getByRole("button", { name: "Add member" }).click();
  const members = page.getByRole("dialog", { name: "Members" });
  await members.getByLabel("Member email").fill(memberEmail);
  await members.getByRole("button", { name: "Add member" }).click();
  await expect(members.getByText(memberName)).toBeVisible();
  await page.keyboard.press("Escape");
  const memberContext = await browser.newContext({ storageState: storageFor("member") });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(path);
  await expect(memberPage.getByText(sprintText("16 Nov", "22 Nov"))).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "Edit board" })).toHaveCount(0);
  await expect(memberPage.getByLabel("Sprint start")).toHaveCount(0);
  await memberContext.close();

  // Edit: an end before the start is refused and the stored sprint stays. Valid dates are saved and
  // shown at once, and after a reload.
  await page.getByRole("button", { name: "Edit board" }).click();
  const form = page.getByRole("form", { name: "Edit board" });
  await expect(form.getByLabel("Sprint start")).toHaveValue("2026-11-16");
  await expect(form.getByLabel("Sprint end")).toHaveValue("2026-11-22");
  await form.getByLabel("Sprint end").fill("2026-11-10");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form.getByText("Must be on or after the start date.")).toBeVisible();
  await expect(form.getByLabel("Sprint end")).toBeFocused();
  await form.getByLabel("Sprint start").fill("2026-12-01");
  await form.getByLabel("Sprint end").fill("2026-12-07");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(sprintText("1 Dec", "7 Dec"))).toBeVisible();
  await expect(page.getByText(sprintText("16 Nov", "22 Nov"))).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(sprintText("1 Dec", "7 Dec"))).toBeVisible();

  // Clear: the line goes, and analytics goes back to the week.
  await page.getByRole("button", { name: "Edit board" }).click();
  await page.getByRole("button", { name: "Clear dates" }).click();
  await page.getByRole("form", { name: "Edit board" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/^Sprint \d/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(/^Sprint \d/)).toHaveCount(0);
  await page.getByRole("button", { name: "Analytics" }).click();
  const week = page.getByRole("dialog", { name: "Analytics" });
  await expect(week.getByText(/^Week of /)).toBeVisible();
  await expect(week.getByText("Cards completed this week")).toBeVisible();
  await page.keyboard.press("Escape");

  // Delete the board so the run leaves nothing behind (the teardown also removes it).
  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("dialog", { name: "Delete board?" }).getByRole("button", { name: "Delete board" }).click();
  await expect(page).toHaveURL(/\/$/);
});
