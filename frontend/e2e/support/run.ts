import { randomBytes } from "node:crypto";
import path from "node:path";

// Run identity for the local acceptance run (T15). Every name and email carries the run tag, so
// cleanup can find all records the run created, including those created through the browser.

export const ACCEPTANCE_DOMAIN = "acceptance.example.test";
export const APP_ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const API_ORIGIN = process.env.LA_API_ORIGIN ?? "http://127.0.0.1:5001";

export type Role = "owner" | "member" | "removed";

export function newRunId(): string {
  return randomBytes(4).toString("hex");
}

export function emailFor(runId: string, role: Role): string {
  return `la-${runId}-${role}@${ACCEPTANCE_DOMAIN}`;
}

export function titleFor(runId: string, kind: string, n: number | string = ""): string {
  return `LA ${runId} ${kind}${n === "" ? "" : ` ${n}`}`;
}

/** Meets the registration rule: 8 to 128 characters, upper, lower, and an ASCII special character. */
export function makePassword(): string {
  return `Aa1!${randomBytes(12).toString("hex")}`;
}

export type RunEnv = { runId: string; ownerPassword: string; memberPassword: string };

/**
 * Passwords are set in process.env by global setup, in memory only. When the list command reads
 * the specs before setup, placeholders are returned; no test body runs in that case.
 */
export function runFromEnv(env: NodeJS.ProcessEnv = process.env): RunEnv {
  return {
    runId: env.LA_RUN_ID ?? "00000000",
    ownerPassword: env.LA_OWNER_PASSWORD ?? "",
    memberPassword: env.LA_MEMBER_PASSWORD ?? "",
  };
}

/** Saved session for a run account (git-ignored storage state, written by global setup). */
export function storageFor(role: "owner" | "member"): string {
  return path.resolve(process.cwd(), `playwright/.auth/${role}.json`);
}
