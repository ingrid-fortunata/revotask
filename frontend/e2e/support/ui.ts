import { expect, type Page } from "@playwright/test";

// UI steps shared by the journeys. Labels come from the components (see the selector table in
// design section 5). Each step asserts its own result, so a failure points at the step.

export async function signInUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function createBoardUi(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create board" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a board" });
  await dialog.getByLabel("Board name").fill(name);
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function addColumnUi(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Add column" }).first().click();
  const form = page.getByRole("form", { name: "Add column" });
  await form.getByLabel("Column name").fill(name);
  await form.getByRole("button", { name: "Add column", exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function addCardUi(page: Page, columnName: string, title: string): Promise<void> {
  await page.getByRole("button", { name: `Add card to ${columnName}` }).click();
  const form = page.getByRole("form", { name: `Add card to ${columnName}` });
  await form.getByLabel("New card").fill(title);
  await form.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("button", { name: `Open ${title}` })).toBeVisible();
}

export async function openCardUi(page: Page, title: string) {
  await page.getByRole("button", { name: `Open ${title}` }).click();
  return page.getByRole("dialog", { name: "Card details" });
}
