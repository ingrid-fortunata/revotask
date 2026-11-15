import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { parseTestDatabaseUrl, resolvePsql } from "./psql";
import { proveDatabase } from "./preflight-steps";
import { resolveDatabaseEnv } from "./env";

// Live check of the read-only database proof (task 1.6) against one API origin. Runs only when
// LA_PROOF_API is set (for example http://127.0.0.1:5002). Output contains results only.
const api = process.env.LA_PROOF_API;

test.describe("database proof (live)", () => {
  test.skip(!api, "set LA_PROOF_API to the API origin under test");

  test("the app's own connections are to the test database", async () => {
    const { testUrl, appUrl } = resolveDatabaseEnv();
    const { databaseNameOf } = await import("./psql");
    const db = parseTestDatabaseUrl(testUrl ?? "", appUrl ? databaseNameOf(appUrl) : undefined);
    const port = new URL(api as string).port;
    const pid = Number(execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim());
    const proof = await proveDatabase({ pid, db, psql: resolvePsql(), api: api as string });
    console.log(`${proof.ok ? "PASS" : "FAIL"} 6 database proof: ${proof.detail}`);
    expect(proof.ok).toBe(true);
  });
});
