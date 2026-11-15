import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Token tracking for cleanup (design 4). Reads the jti and exp claims of a session token without
// verifying the signature. Stores only jti, expiry and a label. A raw token is never written.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TokenRecord = { jti: string; expires_at: string; label: string };

export function runDir(): string {
  return path.resolve(process.cwd(), "playwright/.run");
}

export function runFilePath(runId: string): string {
  return path.join(runDir(), `${runId}.json`);
}

export function jwtClaims(token: string): { jti: string; exp: number } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("session value is not a JWT");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { jti?: unknown; exp?: unknown };
  if (typeof payload.jti !== "string" || !UUID.test(payload.jti)) throw new Error("token has no usable jti");
  return { jti: payload.jti.toLowerCase(), exp: Number(payload.exp) };
}

export function readRecords(runId: string): TokenRecord[] {
  const file = runFilePath(runId);
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf8")) as { tokens: TokenRecord[] }).tokens;
}

/** Record the jti of a token the run received. Duplicates are ignored. */
export function recordToken(runId: string, token: string, label: string): void {
  const { jti, exp } = jwtClaims(token);
  const tokens = readRecords(runId);
  if (tokens.some((t) => t.jti === jti)) return;
  tokens.push({ jti, expires_at: new Date(exp * 1000).toISOString(), label });
  mkdirSync(runDir(), { recursive: true });
  writeFileSync(runFilePath(runId), JSON.stringify({ runId, tokens }, null, 2) + "\n");
}

export function recordedJtis(runId: string): string[] {
  return readRecords(runId).map((t) => t.jti);
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
