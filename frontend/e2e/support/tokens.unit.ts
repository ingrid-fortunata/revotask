import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { jwtClaims, readRecords, recordToken, recordedJtis, runFilePath } from "./tokens";

// Task 2.2: the run file holds the jti and the expiry, and never a token.
const JTI = "0b6a1c1e-3b7e-4f0e-9d58-0a1b2c3d4e5f";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ jti: JTI, exp: 1893456000, sub: "u" })}.signature-not-verified`;

test("a recorded token leaves only its jti and expiry in the run file", () => {
  const cwd = process.cwd();
  const dir = mkdtempSync(path.join(os.tmpdir(), "la-tokens-"));
  process.chdir(dir);
  try {
    expect(jwtClaims(TOKEN)).toEqual({ jti: JTI, exp: 1893456000 });
    recordToken("abcdef12", TOKEN, "owner-setup");
    recordToken("abcdef12", TOKEN, "duplicate"); // the same jti is recorded once
    const text = readFileSync(runFilePath("abcdef12"), "utf8");
    expect(text).not.toMatch(/eyJ/);
    expect(text).not.toContain("signature-not-verified");
    expect(recordedJtis("abcdef12")).toEqual([JTI]);
    expect(readRecords("abcdef12")[0]).toEqual({ jti: JTI, expires_at: "2030-01-01T00:00:00.000Z", label: "owner-setup" });
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a value that is not a JWT with a jti is refused", () => {
  expect(() => jwtClaims("not-a-token")).toThrow();
  expect(() => jwtClaims(`${b64({})}.${b64({ exp: 1 })}.x`)).toThrow("no usable jti");
});
