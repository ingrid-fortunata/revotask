import { test, expect } from "@playwright/test";
import { retryAfterSeconds, sendWithSetupRetry } from "./retry";

const response = (status: number, retryAfter?: string) =>
  new Response(null, { status, headers: retryAfter ? { "retry-after": retryAfter } : {} });

test("Retry-After is honored, capped at 70 s, and defaults to 60 s", () => {
  expect(retryAfterSeconds("3")).toBe(3);
  expect(retryAfterSeconds("500")).toBe(70);
  expect(retryAfterSeconds(null)).toBe(60);
  expect(retryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT")).toBe(60);
});

test("one unexpected 429 is retried once after the wait", async () => {
  const waits: number[] = [];
  const logs: string[] = [];
  const replies = [response(429, "2"), response(200)];
  const result = await sendWithSetupRetry(
    "POST /api/auth/register",
    async () => replies.shift() as Response,
    { sleep: async (ms) => void waits.push(ms), log: (l) => void logs.push(l) },
  );
  expect(result.status).toBe(200);
  expect(waits).toEqual([2000]);
  expect(logs[0]).toBe("rate limited on POST /api/auth/register, retry after 2 s");
});

test("a second 429 stops the run", async () => {
  const replies = [response(429), response(429)];
  await expect(
    sendWithSetupRetry("POST /api/auth/login", async () => replies.shift() as Response, {
      sleep: async () => {},
      log: () => {},
    }),
  ).rejects.toThrow("rate limited twice on POST /api/auth/login; run stopped");
});

test("a response without 429 is returned at once, with no wait", async () => {
  let calls = 0;
  const result = await sendWithSetupRetry("GET /api/health", async () => {
    calls += 1;
    return response(200);
  }, { sleep: async () => { throw new Error("must not wait"); } });
  expect(result.status).toBe(200);
  expect(calls).toBe(1);
});
