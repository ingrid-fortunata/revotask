// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import { DELETE } from "./route";

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";
const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

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

type RequestOptions = {
  origin?: string | null;
  cookie?: string;
};

function removeRequest(options: RequestOptions = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (options.cookie) headers.cookie = options.cookie;
  return new NextRequest(`${APP_ORIGIN}/api/boards/${BOARD_ID}/members/${USER_ID}`, { method: "DELETE", headers });
}

const call = (options: RequestOptions = {}, ids: { id: string; userId: string } = { id: BOARD_ID, userId: USER_ID }) =>
  DELETE(removeRequest(options), { params: Promise.resolve(ids) });

function expectCleared(response: Response) {
  const cookies = setCookies(response);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^revotask_session=;/);
  expect(cookies[0]).toMatch(/Max-Age=0/i);
  expect(cookies[0]).toMatch(/Path=\//);
  expect(cookies[0]).toMatch(/SameSite=lax/i);
  expect(cookies[0]).not.toMatch(/Domain/i);
}

describe("DELETE /api/boards/[id]/members/[userId]", () => {
  it("returns 403 for a missing or mismatched Origin and calls nothing", async () => {
    for (const origin of [null, "http://evil.example"]) {
      const response = await call({ origin, cookie: COOKIE });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(setCookies(response)).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 with no cookie, clears the cookie and makes no upstream call", async () => {
    const response = await call({});
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-UUID board ID", { id: "not-a-uuid", userId: USER_ID }],
    ["a non-UUID user ID", { id: BOARD_ID, userId: "not-a-uuid" }],
    ["a dot-dot user ID", { id: BOARD_ID, userId: ".." }],
    ["a user ID with a slash", { id: BOARD_ID, userId: `${USER_ID}/../../x` }],
    ["a user ID with a query", { id: BOARD_ID, userId: `${USER_ID}?x=1` }],
    ["an empty user ID", { id: BOARD_ID, userId: "" }],
  ])("returns 400 for %s without calling Flask", async (_label, ids) => {
    const response = await call({ cookie: COOKIE }, ids);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards DELETE to the member path with both UUIDs and the cookie bearer, then returns 200 with null data", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: null }));
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/boards/${BOARD_ID}/members/${USER_ID}`);
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(init.body).toBeUndefined();
  });

  it("does not forward the caller's Authorization header or other cookies", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: null }));
    const request = removeRequest({ cookie: `${COOKIE}; other=secret` });
    request.headers.set("authorization", "Bearer caller-token");
    await DELETE(request, { params: Promise.resolve({ id: BOARD_ID, userId: USER_ID }) });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(headers)).not.toMatch(/caller-token|secret/);
    expect(headers).not.toHaveProperty("Cookie");
  });

  it("passes a Flask 409 STATE_CONFLICT for the admin target through and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(409, { error: { code: "STATE_CONFLICT", message: "The board admin cannot be removed." } }),
    );
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("STATE_CONFLICT");
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a Flask 404 NOT_FOUND through and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(404, { error: { code: "NOT_FOUND", message: "Board not found." } }));
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a Flask 403 FORBIDDEN through and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(403, { error: { code: "FORBIDDEN", message: "Only an admin can do this." } }));
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(403);
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a Flask 401 envelope through and clears the session cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }));
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(401);
    expectCleared(response);
  });

  it.each([
    ["a 200 without a data key", () => jsonReply(200, { removed: true })],
    ["HTML with 200", () => new Response("<html>oops</html>", { status: 200 })],
    ["an empty 200", () => new Response("", { status: 200 })],
    ["a Flask 500 envelope", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "x" } })],
    ["a 4xx without an envelope", () => new Response("<html>nope</html>", { status: 409 })],
    ["a redirect", () => new Response("", { status: 302, headers: { Location: "https://evil.example/" } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
  ])("returns 503 and sets no cookie for %s", async (_label, make) => {
    fetchMock.mockImplementation(async () => make());
    const response = await call({ cookie: COOKIE });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(setCookies(response)).toEqual([]);
  });

  it("marks responses private with a request id", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: null }));
    const response = await call({ origin: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
