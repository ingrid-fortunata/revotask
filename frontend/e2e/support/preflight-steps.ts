import { execFileSync } from "node:child_process";
import { databaseNameOf, parseTestDatabaseUrl, resolvePsql, checkConnectivity, runSql, type TestDatabase } from "./psql";
import { resolveDatabaseEnv } from "./env";

// Preflight steps 1 to 5 of design 3. Read-only: no step writes data or sends a mutating request.
// Each step returns its result for the evidence record. Details never contain a URL, a password,
// a token or a cookie value.

export type StepResult = { step: string; ok: boolean; detail: string };

export type Preflight = {
  results: StepResult[];
  db?: TestDatabase;
  psqlPath?: string;
  listenerPid?: number;
};

const API_PORT = 5001;

export async function runSteps(opts: { baseUrl: string; apiOrigin?: string; env?: Record<string, string | undefined> }): Promise<Preflight> {
  const results: StepResult[] = [];
  const out: Preflight = { results };
  const push = (step: string, ok: boolean, detail: string) => results.push({ step, ok, detail });

  // 1. psql
  try {
    out.psqlPath = resolvePsql(opts.env ?? process.env);
    push("1 psql", true, `found at ${out.psqlPath}`);
  } catch (error) {
    push("1 psql", false, (error as Error).message);
    return out;
  }

  // 2. dedicated test database
  const { testUrl, appUrl } = resolveDatabaseEnv(opts.env ?? process.env);
  try {
    if (!testUrl) throw new Error("TEST_DATABASE_URL is not set");
    out.db = parseTestDatabaseUrl(testUrl, appUrl ? databaseNameOf(appUrl) : undefined);
    push("2 test database", true, `database ${out.db.database} on ${out.db.host}:${out.db.port}`);
  } catch (error) {
    push("2 test database", false, (error as Error).message);
    return out;
  }

  // 3. connectivity from the run shell
  try {
    const ok = checkConnectivity(out.psqlPath, out.db);
    push("3 connectivity", ok, ok ? "select 1 returned 1" : "select 1 did not return 1");
    if (!ok) return out;
  } catch (error) {
    push("3 connectivity", false, (error as Error).message);
    return out;
  }

  // 4. services
  const api = opts.apiOrigin ?? `http://127.0.0.1:${API_PORT}`;
  try {
    const health = await fetch(`${api}/api/health`);
    const body = (await health.json().catch(() => ({}))) as { data?: { status?: string } };
    const ok = health.status === 200 && body.data?.status === "ok";
    push("4a Flask health", ok, `status ${health.status}`);
    const login = await fetch(`${opts.baseUrl}/login`, { redirect: "manual" });
    push("4b Next /login", login.status === 200, `status ${login.status} at ${opts.baseUrl}`);
    if (!ok || login.status !== 200) return out;
  } catch (error) {
    push("4 services", false, `unreachable: ${(error as Error).name}`);
    return out;
  }

  // 5. exactly one listener on the API port
  try {
    const raw = execFileSync("lsof", ["-nP", `-iTCP:${API_PORT}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
    const pids = raw.split(/\s+/).filter(Boolean);
    const ok = pids.length === 1;
    out.listenerPid = ok ? Number(pids[0]) : undefined;
    push("5 one listener", ok, ok ? `one listener, pid ${pids[0]}` : `${pids.length} listeners on ${API_PORT}`);
    if (!ok) return out;
  } catch {
    push("5 one listener", false, "lsof unavailable or no listener");
    return out;
  }

  // 6. read-only proof that the running app uses the test database
  try {
    const proof = await proveDatabase({ pid: out.listenerPid as number, db: out.db, psql: out.psqlPath, api });
    push("6 database proof", proof.ok, proof.detail);
  } catch (error) {
    push("6 database proof", false, (error as Error).message);
  }
  return out;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Design 3.6. Reads the app process's established TCP connections, matches their local ports in
 * pg_stat_activity, and passes only when every matched backend is in the test database. Reads only.
 */
export async function proveDatabase(opts: {
  pid: number;
  db: TestDatabase;
  psql: string;
  api: string;
}): Promise<{ ok: boolean; detail: string }> {
  // One unauthenticated request makes the app run its bounded database query.
  await fetch(`${opts.api}/api/health`);

  const lsof = execFileSync("lsof", ["-nP", "-a", "-p", String(opts.pid), "-iTCP", "-sTCP:ESTABLISHED", "-F", "n"], {
    encoding: "utf8",
  });
  const ports = new Set<number>();
  for (const line of lsof.split("\n")) {
    // lsof -F n lines look like: n127.0.0.1:55012->127.0.0.1:5432
    const match = /^n(.+):(\d+)->(.+):(\d+)$/.exec(line.trim());
    if (!match) continue;
    const [, , localPort, remoteHost, remotePort] = match;
    const sameHost = remoteHost === opts.db.host || (LOOPBACK.has(remoteHost) && LOOPBACK.has(opts.db.host));
    if (sameHost && remotePort === opts.db.port) ports.add(Number(localPort));
  }
  if (ports.size === 0) {
    return { ok: false, detail: "no established connection from the app to the database server" };
  }

  const list = [...ports].join(",");
  const rows = runSql(
    opts.psql,
    opts.db,
    `select pid || '|' || coalesce(datname,'') from pg_stat_activity where client_port in (${list})`,
  )
    .split("\n")
    .filter(Boolean);
  if (rows.length === 0) {
    return { ok: false, detail: "no pg_stat_activity backend matches the app's connections" };
  }
  const names = rows.map((row) => row.split("|")[1]);
  const ok = names.every((name) => name === opts.db.database);
  return {
    ok,
    detail: ok
      ? `${rows.length} backend(s) of pid ${opts.pid} in ${opts.db.database}`
      : `app connected to a database other than ${opts.db.database}; nothing was written`,
  };
}
