import { test, expect } from "@playwright/test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildPsqlArgs,
  childEnv,
  databaseNameOf,
  parseTestDatabaseUrl,
  redact,
  resolvePsql,
  runSql,
} from "./psql";

const SECRET = "s3cret-fixture-value";
const URL_FIXTURE = `postgresql+psycopg://revotask:${SECRET}@127.0.0.1:5432/revotask_test`;

test("parses the SQLAlchemy form of TEST_DATABASE_URL without printing the password", () => {
  const db = parseTestDatabaseUrl(URL_FIXTURE, "revotask_dev");
  expect(db).toEqual({
    host: "127.0.0.1",
    port: "5432",
    user: "revotask",
    password: SECRET,
    database: "revotask_test",
    sslmode: undefined,
  });
});

test("refuses a database name that does not end in _test, without echoing the URL", () => {
  const raw = `postgresql://revotask:${SECRET}@127.0.0.1:5432/revotask_dev`;
  let message = "";
  try {
    parseTestDatabaseUrl(raw);
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toContain("must end in _test");
  expect(message).not.toContain(SECRET);
});

test("refuses the application database name", () => {
  expect(() => parseTestDatabaseUrl(URL_FIXTURE, "revotask_test")).toThrow("must differ from DATABASE_URL");
});

test("reads the database name from a URL", () => {
  expect(databaseNameOf(URL_FIXTURE)).toBe("revotask_test");
  expect(databaseNameOf("not a url")).toBe("");
});

test("PSQL override must be an absolute executable path", () => {
  expect(() => resolvePsql({ PSQL: "/no/such/psql-binary" })).toThrow("absolute path");
  expect(() => resolvePsql({ PSQL: "psql" })).toThrow("absolute path");
});

test("finds psql on PATH and fails with a clear message when it is absent", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "la-psql-"));
  try {
    const fake = path.join(dir, "psql");
    writeFileSync(fake, "#!/bin/sh\nexit 0\n");
    chmodSync(fake, 0o755);
    expect(resolvePsql({ PATH: dir })).toBe(fake);
    expect(() => resolvePsql({ PATH: path.join(dir, "missing") })).toThrow("psql is required");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("psql arguments carry no URL and no password", () => {
  const args = buildPsqlArgs("select 1").join(" ");
  expect(args).not.toContain(SECRET);
  expect(args).not.toContain("postgres");
  const env = childEnv(parseTestDatabaseUrl(URL_FIXTURE));
  expect(env.PGPASSWORD).toBe(SECRET);
  expect(env.PGDATABASE).toBe("revotask_test");
});

test("redact removes URLs and secrets from text", () => {
  const text = `could not connect to ${URL_FIXTURE} with ${SECRET}`;
  const out = redact(text, [SECRET]);
  expect(out).not.toContain(SECRET);
  expect(out).not.toContain("revotask:");
});

test("a failing psql error does not contain the password", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "la-psql-fail-"));
  try {
    const fake = path.join(dir, "psql");
    writeFileSync(fake, '#!/bin/sh\necho "auth failed for $PGPASSWORD" >&2\nexit 2\n');
    chmodSync(fake, 0o755);
    const db = parseTestDatabaseUrl(URL_FIXTURE);
    let message = "";
    try {
      runSql(fake, db, "select 1");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("psql failed");
    expect(message).not.toContain(SECRET);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
