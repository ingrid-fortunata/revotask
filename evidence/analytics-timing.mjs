// Timing of E29 (board analytics) on a board of 100 cards with a week of events (T14, Requirement 8.8).
//
// Seeds a disposable board through the Flask API: 100 cards in 4 columns created by three users,
// 40 moves (10 of them into Done), 30 comments and 3 column reorders, so the week holds all five
// event kinds from several actors. It warms up, then times 30 sequential requests from one client,
// and prints the raw timings and the nearest-rank p95 beside the 800 ms reference of NFR 1 (A10).
// It is a recorded measurement, not a pass-or-fail gate. The board is deleted at the end.
//
//   API_URL=http://127.0.0.1:5002 REPORT_FILE=evidence/analytics-timing.json node evidence/analytics-timing.mjs
//
// Sprint mode (boards-membership Revision 2, decision DR4): set SPRINT_DAYS=90 to give the board a
// sprint of that many days around today, so E29 reads a 90-day window. EXTRA_EVENTS=N (with PSQL_URL, a
// connection URL of the test database that Flask uses) also inserts N `card_moved` events spread over
// the whole sprint with `psql`, because the API can only write events stamped "now". The extra rows are
// synthetic and are removed with the board's events at the end. Neither value is printed or recorded.
//
//   SPRINT_DAYS=90 EXTRA_EVENTS=5000 PSQL_URL=... API_URL=http://127.0.0.1:5002 \
//   REPORT_FILE=evidence/analytics-timing-sprint.json node evidence/analytics-timing.mjs
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const SPRINT_DAYS = Number(process.env.SPRINT_DAYS ?? 0);
const EXTRA_EVENTS = Number(process.env.EXTRA_EVENTS ?? 0);
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const API = new URL(process.env.API_URL ?? "").origin;
const SUFFIX = randomBytes(4).toString("hex");
const PASSWORD = `Aa1!${randomBytes(9).toString("hex")}`;

async function api(method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")} -> ${response.status}`);
  return json?.data;
}

const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(0.95 * values.length) - 1];
const round = (n) => Math.round(n * 10) / 10;

async function time(path, token, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const start = performance.now();
    const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    await response.json();
    if (response.status !== 200) throw new Error(`${path.replace(/[0-9a-f-]{36}/g, ":id")} -> ${response.status}`);
    out.push(round(performance.now() - start));
  }
  return out;
}

const users = [];
for (const name of ["Timing Admin", "Timing Ben", "Timing Cy"]) {
  const email = `an-timing-${name.split(" ")[1].toLowerCase()}-${SUFFIX}@t14-check.example.test`;
  await api("POST", "/api/auth/register", null, { name, email, password: PASSWORD });
  const login = await api("POST", "/api/auth/login", null, { email, password: PASSWORD });
  users.push({ email, token: login.access_token });
}
const [admin, ben, cy] = users;
// A sprint of SPRINT_DAYS days whose middle is today, so every event the API writes now is inside it.
const sprint = SPRINT_DAYS
  ? { sprint_start: isoDay(-Math.floor(SPRINT_DAYS / 2)), sprint_end: isoDay(SPRINT_DAYS - 1 - Math.floor(SPRINT_DAYS / 2)) }
  : {};
const board = await api("POST", "/api/boards", admin.token, { name: "Analytics timing board", ...sprint });
try {
  for (const user of [ben, cy]) await api("POST", `/api/boards/${board.id}/members`, admin.token, { email: user.email });
  const columns = [];
  for (const name of ["To do", "Doing", "Review", "Done"]) {
    columns.push((await api("POST", `/api/boards/${board.id}/columns`, admin.token, { name, is_done: name === "Done" })).column);
  }
  const done = columns[3];
  const cards = [];
  for (let n = 1; n <= 100; n += 1) {
    const creator = users[n % 3];
    const created = await api("POST", `/api/columns/${columns[n % 3].id}/cards`, creator.token, {
      title: `Timing card ${String(n).padStart(3, "0")}`,
    });
    cards.push(created.card.id);
  }
  const version = async () => (await api("GET", `/api/boards/${board.id}`, admin.token)).position_version;
  for (let n = 0; n < 40; n += 1) {
    const target = n < 10 ? done : columns[(n % 2) + 1];
    await api("PATCH", `/api/cards/${cards[n]}/position`, users[n % 3].token, {
      column_id: target.id,
      before_card_id: null,
      expected_position_version: await version(),
    });
  }
  for (let n = 0; n < 30; n += 1) {
    await api("POST", `/api/cards/${cards[n]}/comments`, users[n % 3].token, { content: `Note ${n}` });
  }
  for (let n = 0; n < 3; n += 1) {
    await api("PATCH", `/api/boards/${board.id}/columns/reorder`, admin.token, {
      column_id: columns[n].id,
      before_column_id: null,
      expected_position_version: await version(),
    });
  }
  const path = `/api/boards/${board.id}/analytics`;
  if (EXTRA_EVENTS > 0) {
    if (!SPRINT_DAYS || !process.env.PSQL_URL) throw new Error("EXTRA_EVENTS needs SPRINT_DAYS and PSQL_URL");
    const actors = (await Promise.all(users.map((u) => api("GET", "/api/users/me", u.token)))).map((u) => `'${u.id}'`).join(",");
    const sql =
      `INSERT INTO revotask.board_events (id, board_id, actor_id, card_id, kind, occurred_at) ` +
      `SELECT gen_random_uuid(), '${board.id}', (ARRAY[${actors}]::uuid[])[1 + (g % 3)], NULL, 'card_moved', ` +
      `'${sprint.sprint_start}T00:00:00Z'::timestamptz + (g::float / ${EXTRA_EVENTS}) * interval '${SPRINT_DAYS} days' ` +
      `FROM generate_series(0, ${EXTRA_EVENTS - 1}) AS g;`;
    execFileSync("psql", [process.env.PSQL_URL, "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });
  }
  await time(path, admin.token, 5);
  const raw = await time(path, admin.token, 30);
  const body = (await api("GET", path, admin.token));
  const report = {
    slice: SPRINT_DAYS ? "analytics (T14) with a boards-membership Revision 2 sprint window" : "analytics (T14)",
    conditions: "local Flask dev server (python app.run), one client, sequential requests, direct to Flask (no Next.js), test database, warm after 5 warm-up requests",
    window: SPRINT_DAYS ? { kind: "sprint", days: SPRINT_DAYS, extraSyntheticEvents: EXTRA_EVENTS } : { kind: "week", days: 7 },
    fixture: {
      cards: 100,
      columns: 4,
      actors: 3,
      moves: 40,
      movesIntoDone: 10,
      comments: 30,
      columnReorders: 3,
      windowFromE29: body.window,
      completedCards: body.completed_cards,
      activityRows: body.member_activity.length,
    },
    referenceMs: 800,
    e29: { rawMs: raw, p95Ms: p95(raw), maxMs: Math.max(...raw), medianMs: [...raw].sort((a, b) => a - b)[14] },
  };
  const json = JSON.stringify(report, null, 2);
  if (users.some((u) => json.includes(u.email)) || json.includes(PASSWORD)) throw new Error("report contains a secret");
  if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, `${json}\n`);
  console.log(json);
} finally {
  await api("DELETE", `/api/boards/${board.id}`, admin.token).catch(() => {});
  if (EXTRA_EVENTS > 0 && process.env.PSQL_URL) {
    // The board is soft-deleted, so its synthetic events stay unless removed here.
    execFileSync("psql", [process.env.PSQL_URL, "-q", "-c", `DELETE FROM revotask.board_events WHERE board_id = '${board.id}' AND card_id IS NULL AND kind = 'card_moved' AND actor_id IS NOT NULL AND occurred_at < now() - interval '1 minute'`], { stdio: "ignore" });
  }
}
