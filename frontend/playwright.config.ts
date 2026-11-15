import { defineConfig, devices } from "@playwright/test";

// Local acceptance (T15). Servers are started by hand (docs/DEVELOPMENT.md). Playwright starts none.
// Projects record viewport and input mode (design 5). Tags: @touch-only runs on the touch projects
// only; @matrix runs on every project.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./e2e/preflight.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1280, height: 800 }, hasTouch: false },
      grepInvert: /@touch-only/,
    },
    {
      name: "viewport-320",
      use: { browserName: "chromium", viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true },
      grep: /@matrix/,
    },
    {
      name: "mobile-375",
      use: { browserName: "chromium", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
      grep: /@touch-only|@matrix/,
    },
    {
      name: "viewport-768",
      use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
      grep: /@matrix/,
    },
  ],
});
