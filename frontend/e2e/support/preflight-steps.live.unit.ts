import { test, expect } from "@playwright/test";
import { runSteps } from "./preflight-steps";

// Live check of preflight steps 1 to 5 against the running local stack (task 1.4 and 1.5).
// Runs only when LA_LIVE=1, so the default unit run needs no servers or database.
// Output contains step names and results only. No URL, password, token or cookie value.

const live = process.env.LA_LIVE === "1";

test.describe("preflight steps 1 to 5 (live)", () => {
  test.skip(!live, "set LA_LIVE=1 with Flask on 5001, Next on E2E_BASE_URL and the test database running");

  test("steps 1 to 5 pass on the local stack", async () => {
    const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    const pre = await runSteps({ baseUrl });
    for (const r of pre.results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.step}: ${r.detail}`);
    expect(pre.results.every((r) => r.ok)).toBe(true);
    expect(pre.results.length).toBe(7);
  });
});
