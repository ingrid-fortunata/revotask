import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

// Helpers for the local acceptance run (T15). They never place the database URL or its password
// in argv, output or errors. Credentials reach psql only through the child process environment.

export type TestDatabase = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  sslmode?: string;
};

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Use PSQL when it is set (an absolute executable path), otherwise find psql on PATH. */
export function resolvePsql(env: Record<string, string | undefined> = process.env): string {
  const override = env.PSQL?.trim();
  if (override) {
    if (!path.isAbsolute(override) || !isExecutableFile(override)) {
      throw new Error("PSQL must be an absolute path to an executable file");
    }
    return override;
  }
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (dir && isExecutableFile(path.join(dir, "psql"))) return path.join(dir, "psql");
  }
  throw new Error("psql is required: set PSQL or add psql to PATH");
}

const SCHEME = /^postgres(ql)?(\+psycopg)?:\/\//;

/** Database name of a SQLAlchemy or libpq style URL. Returns "" when the URL does not parse. */
export function databaseNameOf(raw: string): string {
  if (!SCHEME.test(raw)) return "";
  try {
    return decodeURIComponent(new URL(raw.replace(/^postgres(ql)?\+psycopg:/, "postgresql:")).pathname.slice(1));
  } catch {
    return "";
  }
}

/**
 * Parse TEST_DATABASE_URL. Refuses a database name that does not end in `_test`, and refuses the
 * application database name. Error messages never contain the URL or the password.
 */
export function parseTestDatabaseUrl(raw: string, appDatabase?: string): TestDatabase {
  if (!SCHEME.test(raw)) throw new Error("TEST_DATABASE_URL: expected a postgresql:// URL");
  let url: URL;
  try {
    url = new URL(raw.replace(/^postgres(ql)?\+psycopg:/, "postgresql:"));
  } catch {
    throw new Error("TEST_DATABASE_URL: the URL does not parse");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database.endsWith("_test")) throw new Error("TEST_DATABASE_URL: database name must end in _test");
  if (appDatabase !== undefined && appDatabase === database) {
    throw new Error("TEST_DATABASE_URL: database name must differ from DATABASE_URL");
  }
  return {
    host: url.hostname || "localhost",
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    sslmode: url.searchParams.get("sslmode") ?? undefined,
  };
}

/** Replace the password and any URL in text before it is printed or stored. */
export function redact(text: string, secrets: string[]): string {
  let out = text.replace(/postgres(ql)?(\+psycopg)?:\/\/\S+/g, "postgresql://<redacted>");
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("<redacted>");
  }
  return out;
}

/** libpq variables for the child process. The password is never in argv. */
export function childEnv(db: TestDatabase, base: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {
    PATH: base.PATH ?? "",
    HOME: base.HOME ?? "",
    LANG: base.LANG ?? "C",
    PGHOST: db.host,
    PGPORT: db.port,
    PGUSER: db.user,
    PGPASSWORD: db.password,
    PGDATABASE: db.database,
    PGCONNECT_TIMEOUT: "5",
  };
  if (db.sslmode) env.PGSSLMODE = db.sslmode;
  return env;
}

/** psql arguments: read-only by design when the SQL is a SELECT. No URL, no password. */
export function buildPsqlArgs(sql: string): string[] {
  return ["-X", "-w", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql];
}

/** Run one statement and return trimmed stdout. Errors are redacted. */
export function runSql(psql: string, db: TestDatabase, sql: string): string {
  const result = spawnSync(psql, buildPsqlArgs(sql), {
    env: childEnv(db) as NodeJS.ProcessEnv,
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? (result.stderr || `exit ${result.status}`);
    throw new Error(`psql failed: ${redact(detail.trim(), [db.password])}`);
  }
  return result.stdout.trim();
}

/** Connectivity check from the run shell (design 3.3). Returns true only for `select 1` = 1. */
export function checkConnectivity(psql: string, db: TestDatabase): boolean {
  return runSql(psql, db, "select 1") === "1";
}
