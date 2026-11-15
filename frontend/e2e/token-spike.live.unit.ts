import { expect, test } from "@playwright/test";
import { cleanupRun } from "./support/cleanup";
import { flask, dataOf, registerUser } from "./support/api";
import { resolveDatabaseEnv } from "./support/env";
import { databaseNameOf, parseTestDatabaseUrl, resolvePsql, runSql } from "./support/psql";
import { emailFor, makePassword, newRunId } from "./support/run";
import { jwtClaims } from "./support/tokens";

// Task 2.3, gate C (live, writes to the test database only). A throwaway account logs in, its user
// row is deleted with the cleanup SQL (design 4, step 8), and the old token must be refused by E30.
// Runs only when LA_SPIKE=1. Output contains results only, never a token or a password.
test.describe("token of a deleted user (spike, live)", () => {
  test.skip(!process.env.LA_SPIKE, "set LA_SPIKE=1 (needs the preflight stack)");

  test("E30 returns 401 for the token of a user row that was deleted", async () => {
    const runId = newRunId();
    const email = emailFor(runId, "owner");
    const password = makePassword();
    const { testUrl, appUrl } = resolveDatabaseEnv();
    const db = parseTestDatabaseUrl(testUrl ?? "", appUrl ? databaseNameOf(appUrl) : undefined);
    const psql = resolvePsql();
    let jti = "";
    try {
      await registerUser(`LA ${runId} spike`, email, password);
      const login = await flask("POST", "/api/auth/login", { body: { email, password } });
      expect(login.status).toBe(200);
      const token = dataOf<{ access_token: string }>(login.json).access_token;
      jti = jwtClaims(token).jti;
      expect((await flask("GET", "/api/users/me", { token })).status).toBe(200);

      runSql(psql, db, `delete from revotask.users where email = '${email}';`);
      const after = await flask("GET", "/api/users/me", { token });
      console.log(`spike 2.3: E30 with the token of a deleted user returned ${after.status}`);
      expect(after.status).toBe(401);
    } finally {
      const counts = cleanupRun(psql, db, runId, jti ? [jti] : []);
      console.log(`spike cleanup verified: ${JSON.stringify(counts)}`);
    }
  });
});
