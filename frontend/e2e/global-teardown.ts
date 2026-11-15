import { resolveDatabaseEnv } from "./support/env";
import { cleanupRun } from "./support/cleanup";
import { databaseNameOf, parseTestDatabaseUrl, resolvePsql } from "./support/psql";
import { recordedJtis } from "./support/tokens";

// Global teardown (design 4). Deletes every record of this run, then fails the run if any remain.

export default async function globalTeardown(): Promise<void> {
  const runId = process.env.LA_RUN_ID;
  if (!runId) return; // setup stopped before any write
  const { testUrl, appUrl } = resolveDatabaseEnv();
  const db = parseTestDatabaseUrl(testUrl ?? "", appUrl ? databaseNameOf(appUrl) : undefined);
  const counts = cleanupRun(resolvePsql(), db, runId, recordedJtis(runId));
  console.log(`cleanup verified for run ${runId}: ${JSON.stringify(counts)}`);
}
