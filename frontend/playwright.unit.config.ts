import { defineConfig } from "@playwright/test";

// Unit tests for the local acceptance helpers (T15). No browser, no servers, no database.
// Run with: npm run e2e:unit
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.unit.ts",
  fullyParallel: true,
  reporter: "list",
  projects: [{ name: "unit" }],
});
