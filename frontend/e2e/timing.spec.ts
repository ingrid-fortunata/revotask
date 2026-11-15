import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { API_ORIGIN, runFromEnv, storageFor, titleFor } from "./support/run";
import { tokenFromStorage } from "./support/api";
import { addCard, addColumn, createBoard } from "./support/seed";

// LA-7 (V12): 30 sequential E07 requests after warm-up, nearest-rank p95 (the 29th sorted value).
// Local, warm, Flask direct. Not a deployment claim. Writes the raw timings to evidence.
const run = runFromEnv();
const WARMUP = 5;
const MEASURED = 30;
const TARGET_MS = 800;

test.use({ storageState: storageFor("owner") });

test("30 sequential E07 requests, warm (LA-7) @timing", async () => {
  test.setTimeout(300_000);
  const token = tokenFromStorage(storageFor("owner"));
  const boardId = await createBoard(token, titleFor(run.runId, "board", "timing"));
  const columns = [await addColumn(token, boardId, "Todo"), await addColumn(token, boardId, "Doing"), await addColumn(token, boardId, "Done")];
  for (let i = 0; i < 100; i += 1) await addCard(token, columns[i % 3], titleFor(run.runId, "card", i));

  const get = async () => {
    const started = performance.now();
    const res = await fetch(`${API_ORIGIN}/api/boards/${boardId}`, { headers: { authorization: `Bearer ${token}` } });
    await res.arrayBuffer();
    expect(res.status).toBe(200);
    return performance.now() - started;
  };
  for (let i = 0; i < WARMUP; i += 1) await get();
  const timings: number[] = [];
  for (let i = 0; i < MEASURED; i += 1) timings.push(await get());

  const sorted = [...timings].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(0.95 * MEASURED) - 1]; // nearest rank: the 29th of 30
  const flaskVersion = (() => {
    try {
      return execFileSync(path.resolve("../backend/.venv/bin/flask"), ["--version"], { encoding: "utf8" }).split("\n")[0];
    } catch {
      return "unavailable";
    }
  })();
  const record = {
    recorded: new Date().toISOString(),
    scope: "local, warm, Flask direct, not deployed",
    endpoint: "E07 GET /api/boards/{id}",
    fixture: { cards: 100, columns: 3 },
    warmup: WARMUP,
    measured: MEASURED,
    environment: { machine: os.hostname().split(".")[0] ? "local macOS" : "unknown", node: process.version, flask: flaskVersion },
    raw_ms: timings.map((t) => Number(t.toFixed(1))),
    p95_ms: Number(p95.toFixed(1)),
    target_ms: TARGET_MS,
    pass: p95 <= TARGET_MS,
  };
  const dir = path.resolve("../evidence");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "local-acceptance-T15-timing.json"), JSON.stringify(record, null, 2) + "\n");
  expect(p95, `p95 ${p95.toFixed(1)} ms`).toBeLessThanOrEqual(TARGET_MS);
});
