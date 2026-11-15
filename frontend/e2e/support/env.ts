import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Reads KEY=VALUE pairs from a local env file. Values are returned to the caller and never printed
// here. Lines that do not parse are ignored. Paths are relative to the frontend folder, where the
// npm scripts run.

export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export const BACKEND_ENV_FILE = path.resolve(process.cwd(), "../backend/.env");

/** process.env first, then backend/.env. Used for TEST_DATABASE_URL and DATABASE_URL only. */
export function resolveDatabaseEnv(env: Record<string, string | undefined> = process.env): {
  testUrl: string | undefined;
  appUrl: string | undefined;
} {
  const file = readEnvFile(BACKEND_ENV_FILE);
  return {
    testUrl: env.TEST_DATABASE_URL ?? file.TEST_DATABASE_URL,
    appUrl: env.DATABASE_URL ?? file.DATABASE_URL,
  };
}
