import { test } from "@playwright/test";
import { resolveDatabaseEnv } from "./support/env";
import { cleanupRun } from "./support/cleanup";
import { databaseNameOf, parseTestDatabaseUrl, resolvePsql } from "./support/psql";
import { recordedJtis } from "./support/tokens";

// Manual cleanup of one run: LA_CLEANUP_RUN=<runId> npm run e2e:cleanup. Skipped otherwise.
test("manual cleanup of one local acceptance run", () => {
  const runId = process.env.LA_CLEANUP_RUN;
  test.skip(!runId, "set LA_CLEANUP_RUN=<runId>");
  const { testUrl, appUrl } = resolveDatabaseEnv();
  const db = parseTestDatabaseUrl(testUrl ?? "", appUrl ? databaseNameOf(appUrl) : undefined);
  const counts = cleanupRun(resolvePsql(), db, runId as string, recordedJtis(runId as string));
  console.log(`cleanup verified for run ${runId}: ${JSON.stringify(counts)}`);
});
