// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE_URL,
  APP_ORIGIN,
  authRequest,
  jsonReply,
  jwtLike,
  setCookies,
  validToken,
} from "@/lib/server/testSupport";
import { POST } from "./route";

const fetchMock = vi.fn();
const CREDENTIALS = { email: "ada@example.com", password: "correct horse battery" };
const USER = { id: "1", name: "Ada", email: "ada@example.com" };

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", API_BASE_URL);
  vi.stubEnv("APP_ORIGIN", APP_ORIGIN);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const call = (options: Parameters<typeof authRequest>[1]) => POST(authRequest("/api/auth/login", options));
const loginReply = (token: string, expiresIn: unknown = 3600) =>
  jsonReply(200, { data: { access_token: token, expires_in: expiresIn, user: { ...USER, password_hash: "x" } } });

describe("POST /api/auth/login", () => {
  it("returns 403 for a missing or mismatched Origin without calling Flask or setting a cookie", async () => {
    for (const origin of [null, "http://evil.example", "https://localhost:3000"]) {
      const response = await call({ origin, body: CREDENTIALS });
      expect(response.status).toBe(403);
      expect(setCookies(response)).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 415, 413 and 400 for a bad request without calling Flask", async () => {
    expect((await call({ raw: "{}", contentType: "text/plain" })).status).toBe(415);
    expect((await call({ raw: JSON.stringify({ ...CREDENTIALS, email: "a".repeat(70_000) }) })).status).toBe(413);
    expect((await call({ raw: "{oops" })).status).toBe(400);
    const extra = await call({ body: { ...CREDENTIALS, remember: true } });
    expect((await extra.json()).error.fields).toEqual({ remember: "Unknown field." });
    const missing = await call({ body: { email: "a@b.co" } });
    expect((await missing.json()).error.fields).toEqual({ password: "Required." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets one host-only HttpOnly Lax cookie and returns only the public user", async () => {
    const token = validToken();
    fetchMock.mockResolvedValue(loginReply(token));
    const response = await call({ body: CREDENTIALS });
    expect(response.status).toBe(200);
    expect(await response.clone().json()).toEqual({ data: { user: USER } });

    const cookies = setCookies(response);
    expect(cookies).toHaveLength(1);
    const cookie = cookies[0];
    expect(cookie).toMatch(/^revotask_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain/i);
    expect(cookie).not.toMatch(/Secure/i); // loopback http origin
    const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
    expect(maxAge).toBeGreaterThan(3590);
    expect(maxAge).toBeLessThanOrEqual(3600);
  });

  it("never puts the token or hash in the body or any header except Set-Cookie", async () => {
    const token = validToken();
    fetchMock.mockResolvedValue(loginReply(token));
    const response = await call({ body: CREDENTIALS });
    const text = await response.text();
    expect(text).not.toContain(token);
    expect(text).not.toMatch(/access_token|password|hash/i);
    for (const [name, value] of response.headers.entries()) {
      if (name.toLowerCase() === "set-cookie") continue;
      expect(value).not.toContain(token);
    }
    expect(response.headers.has("x-middleware-set-cookie")).toBe(false);
    const carriers = [...response.headers.entries()].filter(([, value]) => value.includes(token));
    expect(carriers).toHaveLength(1);
  });

  it("is Secure on an https APP_ORIGIN", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example");
    fetchMock.mockResolvedValue(loginReply(validToken()));
    const response = await POST(authRequest("/api/auth/login", { origin: "https://app.example", body: CREDENTIALS }));
    expect(setCookies(response)[0]).toMatch(/Secure/i);
  });

  it("bounds the cookie lifetime by the token's own remaining life", async () => {
    fetchMock.mockResolvedValue(loginReply(validToken(120)));
    const response = await call({ body: CREDENTIALS });
    const maxAge = Number(/Max-Age=(\d+)/i.exec(setCookies(response)[0])?.[1]);
    expect(maxAge).toBeLessThanOrEqual(120);
    expect(maxAge).toBeGreaterThan(110);
  });

  it("forwards exactly email and password to the login path", async () => {
    fetchMock.mockResolvedValue(loginReply(validToken()));
    await call({ body: CREDENTIALS });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/auth/login`);
    expect(JSON.parse(init.body)).toEqual(CREDENTIALS);
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("passes a Flask 401 through with no Set-Cookie", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(401, { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password.", request_id: "f-1" } }),
    );
    const response = await call({ body: CREDENTIALS });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("INVALID_CREDENTIALS");
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a 429 through with Retry-After", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(429, { error: { code: "RATE_LIMITED", message: "Too many requests." } }, { "Retry-After": "30" }),
    );
    const response = await call({ body: CREDENTIALS });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it.each([
    ["a malformed 200", jsonReply(200, { data: {} })],
    ["a 200 without a user", jsonReply(200, { data: { access_token: validToken(), expires_in: 3600 } })],
    ["expires_in of 0", loginReply(validToken(), 0)],
    ["expires_in as a string", loginReply(validToken(), "3600")],
    ["expires_in of 100000", loginReply(validToken(), 100_000)],
    ["a token that has expired", loginReply(jwtLike({ exp: 10 }))],
    ["a token with no exp", loginReply(jwtLike({}))],
    ["a token that is not a JWT", loginReply("opaque")],
    ["a 201 success", jsonReply(201, { data: { access_token: "t" } })],
    ["HTML", new Response("<html>oops</html>", { status: 200 })],
  ])("returns 503 and sets no cookie for %s", async (_label, reply) => {
    fetchMock.mockResolvedValue(reply);
    const response = await call({ body: CREDENTIALS });
    expect(response.status).toBe(503);
    expect(setCookies(response)).toEqual([]);
    expect(await response.text()).not.toMatch(/access_token/);
  });

  it("returns 503 with no cookie when Flask is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));
    const response = await call({ body: CREDENTIALS });
    expect(response.status).toBe(503);
    expect(setCookies(response)).toEqual([]);
  });

  it("marks every response private and not stored", async () => {
    fetchMock.mockResolvedValue(loginReply(validToken()));
    const ok = await call({ body: CREDENTIALS });
    const bad = await call({ origin: null, body: CREDENTIALS });
    for (const response of [ok, bad]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-request-id")).toBeTruthy();
    }
  });
});
