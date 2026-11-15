import { runSql, type TestDatabase } from "./psql";
import { isUuid } from "./tokens";

// Cleanup for one run (design 4). Hard delete in one transaction, children first, because every
// foreign key is ON DELETE RESTRICT. Revocation rows go last and only for the run's own jti values.

const HEX8 = /^[0-9a-f]{8}$/;

export const COUNT_LABELS = [
  "users",
  "boards",
  "board_columns",
  "cards",
  "card_comments",
  "board_members",
  "board_events",
  "notifications",
  "revoked_tokens",
] as const;

function scope(runId: string) {
  if (!HEX8.test(runId)) throw new Error("run id must be 8 lowercase hex characters");
  const U = `(select id from revotask.users where email like 'la-${runId}-%@acceptance.example.test')`;
  const B = `(select id from revotask.boards where creator_id in ${U})`;
  const C = `(select id from revotask.cards where column_id in (select id from revotask.board_columns where board_id in ${B}))`;
  return { U, B, C };
}

function jtiList(jtis: string[]): string {
  for (const jti of jtis) if (!isUuid(jti)) throw new Error("revocation id is not a UUID");
  return jtis.map((j) => `'${j.toLowerCase()}'`).join(",");
}

export function cleanupSql(runId: string, jtis: string[]): string {
  const { U, B, C } = scope(runId);
  const steps = [
    `delete from revotask.notifications where recipient_id in ${U} or actor_id in ${U} or board_id in ${B} or card_id in ${C};`,
    `delete from revotask.board_events where board_id in ${B} or actor_id in ${U};`,
    `delete from revotask.card_comments where author_id in ${U} or card_id in ${C};`,
    `delete from revotask.cards where id in ${C};`,
    `delete from revotask.board_columns where board_id in ${B};`,
    `delete from revotask.board_members where board_id in ${B} or user_id in ${U};`,
    `delete from revotask.boards where id in ${B};`,
    `delete from revotask.users where id in ${U};`,
  ];
  if (jtis.length > 0) steps.push(`delete from revotask.revoked_tokens where jti in (${jtiList(jtis)});`);
  return `begin; ${steps.join(" ")} commit;`;
}

export function countSql(runId: string, jtis: string[]): string {
  const { U, B, C } = scope(runId);
  const parts = [
    `select 'users', count(*) from revotask.users where id in ${U}`,
    `select 'boards', count(*) from revotask.boards where id in ${B}`,
    `select 'board_columns', count(*) from revotask.board_columns where board_id in ${B}`,
    `select 'cards', count(*) from revotask.cards where id in ${C}`,
    `select 'card_comments', count(*) from revotask.card_comments where author_id in ${U} or card_id in ${C}`,
    `select 'board_members', count(*) from revotask.board_members where board_id in ${B} or user_id in ${U}`,
    `select 'board_events', count(*) from revotask.board_events where board_id in ${B} or actor_id in ${U}`,
    `select 'notifications', count(*) from revotask.notifications where recipient_id in ${U} or actor_id in ${U} or board_id in ${B}`,
    jtis.length > 0
      ? `select 'revoked_tokens', count(*) from revotask.revoked_tokens where jti in (${jtiList(jtis)})`
      : `select 'revoked_tokens', 0`,
  ];
  return parts.join(" union all ");
}

export type CleanupCounts = Record<string, number>;

export function parseCounts(output: string): CleanupCounts {
  const counts: CleanupCounts = {};
  for (const line of output.split("\n").filter(Boolean)) {
    const [label, value] = line.split("|");
    counts[label] = Number(value);
  }
  return counts;
}

/** Delete the run's records, then count what remains. Throws if anything is left or SQL fails. */
export function cleanupRun(psql: string, db: TestDatabase, runId: string, jtis: string[]): CleanupCounts {
  runSql(psql, db, cleanupSql(runId, jtis));
  const remaining = parseCounts(runSql(psql, db, countSql(runId, jtis)));
  const left = Object.entries(remaining).filter(([, n]) => n !== 0);
  if (left.length > 0) {
    throw new Error(`cleanup failed for run ${runId}: rows left ${JSON.stringify(Object.fromEntries(left))}`);
  }
  return remaining;
}
