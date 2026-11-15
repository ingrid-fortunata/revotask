import { test, expect } from "@playwright/test";
import { flask } from "./support/api";
import { emailFor, runFromEnv } from "./support/run";
import { recordToken } from "./support/tokens";

// LA-2 (V09): four auth scenarios. Anonymous runs use an empty storage state.
const run = runFromEnv();
const owner = emailFor(run.runId, "owner");

test.use({ storageState: { cookies: [], origins: [] } });

test("valid login opens the dashboard (LA-2a)", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(owner);
  await page.getByLabel("Password").fill(run.ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Your boards" })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "revotask_session");
  if (cookie) recordToken(run.runId, cookie.value, "owner-login-ui");
});

test("invalid credentials show one generic message (LA-2b)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(owner);
  await page.getByLabel("Password").fill(`${run.ownerPassword}-wrong`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.", { exact: true })).toBeVisible();
});

test("unauthenticated visit to a private route redirects to login (LA-2c)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("private route after logout redirects to login, and the revoked token is refused (LA-2d)", async ({ page, context }) => {
  // A fresh sign-in for this scenario only, so other suites keep their sessions.
  await page.goto("/login");
  await page.getByLabel("Email").fill(owner);
  await page.getByLabel("Password").fill(run.ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your boards" })).toBeVisible();

  const before = (await context.cookies()).find((c) => c.name === "revotask_session");
  expect(before, "session cookie before logout").toBeTruthy();
  recordToken(run.runId, before!.value, "owner-logout-subject");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  const replay = await flask("GET", "/api/users/me", { token: before!.value });
  expect(replay.status).toBe(401);
});

