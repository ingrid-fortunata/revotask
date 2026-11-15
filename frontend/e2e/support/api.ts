import { readFileSync } from "node:fs";
import { request as playwrightRequest, type APIRequestContext, type APIResponse } from "@playwright/test";
import { API_ORIGIN, APP_ORIGIN } from "./run";
import { sendWithSetupRetry, type Reply } from "./retry";

// Direct API calls for setup and seeding. Setup calls may use the one-retry helper. Test bodies
// call these only for seeding or for the second user's actions, never for a rate-limit assertion.

export type ApiReply = { status: number; json: unknown };

/** The `data` member of a JSON envelope. The caller states the expected type. */
export function dataOf<T>(json: unknown): T {
  return (json as { data: T } | null)?.data as T;
}

export async function flask(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<ApiReply> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Registration through Flask (E02), with the one-retry rule for an unexpected 429. */
export async function registerUser(name: string, email: string, password: string): Promise<void> {
  const reply = await sendWithSetupRetry("POST /api/auth/register", async () => {
    const res = await fetch(`${API_ORIGIN}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    return res;
  });
  if (reply.status !== 201) throw new Error(`register returned ${reply.status}`);
}

function adapt(r: APIResponse): Reply & { status: number } {
  return { status: r.status(), headers: { get: (name: string) => r.headers()[name.toLowerCase()] ?? null } };
}

/**
 * Log in through the Next login route so the session cookie lands in a Playwright storage state
 * file (the file is git-ignored). Returns the session token, which is the cookie value. The token
 * is returned to the caller only; it is never printed.
 */
export async function loginThroughNext(email: string, password: string, storagePath: string): Promise<string> {
  const ctx: APIRequestContext = await playwrightRequest.newContext({ baseURL: APP_ORIGIN });
  try {
    const reply = await sendWithSetupRetry("POST /api/auth/login", () =>
      ctx.post("/api/auth/login", { data: { email, password }, headers: { Origin: APP_ORIGIN } }).then(adapt),
    );
    if (reply.status !== 200) throw new Error(`login returned ${reply.status}`);
    await ctx.storageState({ path: storagePath });
    const state = JSON.parse(readFileSync(storagePath, "utf8")) as { cookies: { name: string; value: string }[] };
    const cookie = state.cookies.find((c) => c.name === "revotask_session");
    if (!cookie) throw new Error("login did not set the session cookie");
    return cookie.value;
  } finally {
    await ctx.dispose();
  }
}

/** Session token of a saved storage state file (the cookie value). Not printed. */
export function tokenFromStorage(storagePath: string): string {
  const state = JSON.parse(readFileSync(storagePath, "utf8")) as { cookies: { name: string; value: string }[] };
  const cookie = state.cookies.find((c) => c.name === "revotask_session");
  if (!cookie) throw new Error("storage state has no session cookie");
  return cookie.value;
}
