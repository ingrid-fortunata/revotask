import { mkdirSync } from "node:fs";
import path from "node:path";
import { registerUser, loginThroughNext } from "./support/api";
import { emailFor, makePassword, newRunId, APP_ORIGIN, API_ORIGIN } from "./support/run";
import { recordToken } from "./support/tokens";
import { runSteps } from "./support/preflight-steps";

// Global setup (design 3 and 4). Runs the read-only checks first. Only after they pass does it
// create the run's two accounts and their sessions. Passwords stay in process.env, in memory.

export default async function globalSetup(): Promise<void> {
  const pre = await runSteps({ baseUrl: APP_ORIGIN, apiOrigin: API_ORIGIN });
  for (const r of pre.results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.step}: ${r.detail}`);
  const failed = pre.results.find((r) => !r.ok);
  if (failed) throw new Error(`preflight stopped at ${failed.step}; nothing was written`);

  const runId = newRunId();
  const ownerPassword = makePassword();
  const memberPassword = makePassword();
  // Set before any write, so global teardown can clean up even if a later setup step fails.
  process.env.LA_RUN_ID = runId;
  process.env.LA_OWNER_PASSWORD = ownerPassword;
  process.env.LA_MEMBER_PASSWORD = memberPassword;

  mkdirSync(path.resolve("playwright/.auth"), { recursive: true });
  await registerUser(`LA ${runId} owner`, emailFor(runId, "owner"), ownerPassword);
  await registerUser(`LA ${runId} member`, emailFor(runId, "member"), memberPassword);

  const ownerToken = await loginThroughNext(
    emailFor(runId, "owner"),
    ownerPassword,
    path.resolve("playwright/.auth/owner.json"),
  );
  recordToken(runId, ownerToken, "owner-setup");
  const memberToken = await loginThroughNext(
    emailFor(runId, "member"),
    memberPassword,
    path.resolve("playwright/.auth/member.json"),
  );
  recordToken(runId, memberToken, "member-setup");
  console.log(`run ${runId}: two accounts and two sessions created`);
}
