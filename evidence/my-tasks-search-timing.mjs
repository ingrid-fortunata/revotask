// Timing of E22 (board search) and E21 (My Tasks) on a board of 100 cards (T11, Requirement 8.9).
//
// Seeds a disposable board with 100 cards through the Flask API (50 assigned to the caller),
// warms up, then times 30 sequential requests of each endpoint from one client. It prints the
// raw timings and the nearest-rank p95 beside the 800 ms reference of NFR 1. It is a recorded
// measurement, not a pass-or-fail gate (decision S4). The board is deleted at the end.
//
//   API_URL=http://127.0.0.1:5002 node evidence/my-tasks-search-timing.mjs
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const API = new URL(process.env.API_URL ?? "").origin;
const SUFFIX = randomBytes(4).toString("hex");
const EMAIL = `ts-timing-${SUFFIX}@t11-check.example.test`;
const PASSWORD = `Aa1!${randomBytes(3).toString("hex")}`;

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
    if (response.status !== 200) throw new Error(`${path.split("?")[0].replace(/[0-9a-f-]{36}/g, ":id")} -> ${response.status}`);
    out.push(round(performance.now() - start));
  }
  return out;
}

await api("POST", "/api/auth/register", null, { name: "Timing User", email: EMAIL, password: PASSWORD });
const token = (await api("POST", "/api/auth/login", null, { email: EMAIL, password: PASSWORD })).access_token;
const me = (await api("GET", "/api/users/me", token)).id;
const board = await api("POST", "/api/boards", token, { name: "Timing board" });
try {
  const columns = [];
  for (const name of ["To do", "Doing", "Review", "Done"]) {
    columns.push((await api("POST", `/api/boards/${board.id}/columns`, token, { name, is_done: name === "Done" })).column);
  }
  for (let n = 1; n <= 100; n += 1) {
    const column = columns[n % columns.length];
    await api("POST", `/api/columns/${column.id}/cards`, token, {
      title: `Timing card ${String(n).padStart(3, "0")}`,
      ...(n % 2 === 0 ? { assignee_id: me } : {}),
    });
  }
  const search = `/api/boards/${board.id}/cards/search?q=${encodeURIComponent("card 0")}`;
  const tasks = "/api/cards?assignee=me";
  await time(search, token, 5);
  await time(tasks, token, 5);
  const e22 = await time(search, token, 30);
  const e21 = await time(tasks, token, 30);
  const body = await (await fetch(`${API}${search}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const report = {
    slice: "my-tasks-search (T11)",
    conditions: "local Flask dev server (flask run), one client, sequential requests, direct to Flask (no Next.js), test database, warm after 5 warm-up requests each",
    fixture: { cards: 100, assignedToCaller: 50, columns: 4, e22Query: "card 0", e22Results: body.data.length },
    referenceMs: 800,
    e22: { rawMs: e22, p95Ms: p95(e22), maxMs: Math.max(...e22) },
    e21: { rawMs: e21, p95Ms: p95(e21), maxMs: Math.max(...e21) },
  };
  const json = JSON.stringify(report, null, 2);
  if (json.includes(EMAIL) || json.includes(PASSWORD)) throw new Error("report contains a secret");
  if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, json);
  console.log(json);
} finally {
  await api("DELETE", `/api/boards/${board.id}`, token).catch(() => {});
}
