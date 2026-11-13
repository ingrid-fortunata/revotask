// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, authRequest, jsonReply, setCookies } from "@/lib/server/testSupport";
import { POST } from "./route";

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";

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

const call = (options: Parameters<typeof authRequest>[1] = {}) => POST(authRequest("/api/auth/logout", options));

function expectCleared(response: Response) {
  const cookies = setCookies(response);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^revotask_session=;/);
  expect(cookies[0]).toMatch(/Max-Age=0/i);
  expect(cookies[0]).toMatch(/Path=\//);
  expect(cookies[0]).toMatch(/SameSite=lax/i);
  expect(cookies[0]).not.toMatch(/Domain/i);
}

describe("POST /api/auth/logout", () => {
  it("returns 403 for a missing or mismatched Origin, keeps the cookie and revokes nothing", async () => {
    for (const origin of [null, "http://evil.example"]) {
      const response = await call({ origin, cookie: COOKIE });
      expect(response.status).toBe(403);
      expect(setCookies(response)).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with no cookie clears the cookie, returns 200 and makes no upstream call", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revokes at Flask with the cookie-derived bearer, then clears the cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: null }));
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
    expectCleared(response);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/auth/logout`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
  });

  it("clears the cookie and answers 200 when Flask says the session is already invalid", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }),
    );
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(200);
    expectCleared(response);
  });

  it.each([
    ["a Flask 500", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } })],
    ["a Flask 503 envelope", () => jsonReply(503, { error: { code: "SERVICE_UNAVAILABLE", message: "x" } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
    ["an HTML 502", () => new Response("<html>Bad gateway</html>", { status: 502 })],
    ["a malformed 200", () => new Response("not json", { status: 200 })],
    ["a malformed 401", () => new Response("<html>nope</html>", { status: 401 })],
    ["a redirect", () => new Response("", { status: 302, headers: { Location: "https://evil.example/" } })],
    ["an unexpected 403", () => jsonReply(403, { error: { code: "FORBIDDEN", message: "x" } })],
  ])("returns 503 and keeps the cookie for %s", async (_label, make) => {
    fetchMock.mockImplementation(async () => make());
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(setCookies(response)).toEqual([]);
  });

  it("does not forward the caller's Authorization or other cookies", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: null }));
    const request = authRequest("/api/auth/logout", { cookie: `${COOKIE}; other=secret` });
    request.headers.set("authorization", "Bearer caller-token");
    await POST(request);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(headers)).not.toMatch(/caller-token|secret/);
    expect(headers).not.toHaveProperty("Cookie");
  });

  it("is Secure on the clearing cookie for an https APP_ORIGIN", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example");
    const response = await POST(authRequest("/api/auth/logout", { origin: "https://app.example" }));
    expect(setCookies(response)[0]).toMatch(/Secure/i);
  });

  it("marks the response private and returns a request id", async () => {
    const response = await call();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
