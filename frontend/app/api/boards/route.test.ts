// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import { POST } from "./route";

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";
const BOARD = { id: "11111111-1111-4111-8111-111111111111", name: "Roadmap", role: "admin", position_version: 0 };

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
  body?: unknown;
  raw?: string;
  contentType?: string | null;
};

function boardRequest(options: RequestOptions = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (options.contentType !== null) headers["content-type"] = options.contentType ?? "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new NextRequest(`${APP_ORIGIN}/api/boards`, { method: "POST", headers, body });
}

const call = (options: RequestOptions = {}) => POST(boardRequest(options));

function expectCleared(response: Response) {
  const cookies = setCookies(response);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^revotask_session=;/);
  expect(cookies[0]).toMatch(/Max-Age=0/i);
  expect(cookies[0]).toMatch(/Path=\//);
  expect(cookies[0]).toMatch(/SameSite=lax/i);
  expect(cookies[0]).not.toMatch(/Domain/i);
}

describe("POST /api/boards", () => {
  it("returns 403 for a missing or mismatched Origin, with or without a cookie, and calls nothing", async () => {
    for (const origin of [null, "http://evil.example", "https://localhost:3000"]) {
      for (const cookie of [COOKIE, undefined]) {
        const response = await call({ origin, cookie, body: { name: "Roadmap" } });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe("FORBIDDEN");
        expect(setCookies(response)).toEqual([]);
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 with no cookie, clears the cookie and makes no upstream call", async () => {
    const response = await call({ body: { name: "Roadmap" } });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the cookie before reading the body", async () => {
    const response = await call({ contentType: "text/plain", raw: "not json" });
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 415 for a non-JSON Content-Type without calling Flask", async () => {
    const response = await call({ cookie: COOKIE, contentType: "text/plain", raw: '{"name":"Roadmap"}' });
    expect(response.status).toBe(415);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 413 for a body over 64 KiB without calling Flask", async () => {
    const response = await call({ cookie: COOKIE, raw: JSON.stringify({ name: "a".repeat(70_000) }) });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("CONTENT_TOO_LARGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{oops"],
    ["a JSON array", "[]"],
    ["a JSON string", '"Roadmap"'],
  ])("returns 400 for %s without calling Flask", async (_label, raw) => {
    const response = await call({ cookie: COOKIE, raw });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 with a field error for an unknown key and calls nothing", async () => {
    const response = await call({ cookie: COOKIE, body: { name: "Roadmap", role: "admin" } });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ role: "Unknown field." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 with a field error for a missing name and calls nothing", async () => {
    const response = await call({ cookie: COOKIE, body: {} });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ name: "Required." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the optional sprint pair with the name and nothing else (Requirement 8.15)", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: BOARD }));
    const body = { name: "Roadmap", sprint_start: "2026-11-16", sprint_end: "2026-11-22" };
    const response = await call({ cookie: COOKIE, body });
    expect(response.status).toBe(201);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body);
  });

  it("forwards both sprint keys as null and still refuses a sprint key without a name", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: BOARD }));
    const nulls = { name: "Roadmap", sprint_start: null, sprint_end: null };
    await call({ cookie: COOKIE, body: nulls });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(nulls);

    fetchMock.mockClear();
    const response = await call({ cookie: COOKIE, body: { sprint_start: "2026-11-16", sprint_end: "2026-11-22" } });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ name: "Required." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a Flask sprint field error through", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(400, {
        error: { code: "VALIDATION_ERROR", message: "Check the submitted fields.", fields: { sprint_end: "Must be on or after the start date." } },
      }),
    );
    const response = await call({ cookie: COOKIE, body: { name: "R", sprint_start: "2026-11-22", sprint_end: "2026-11-16" } });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ sprint_end: "Must be on or after the start date." });
  });

  it("forwards the name as POST to the boards path with the cookie bearer and returns the created board", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: BOARD }));
    const response = await call({ cookie: COOKIE, body: { name: "Roadmap" } });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: BOARD });
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/boards`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ name: "Roadmap" });
  });

  it("does not forward the caller's Authorization header or other cookies", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: BOARD }));
    const request = boardRequest({ cookie: `${COOKIE}; other=secret`, body: { name: "Roadmap" } });
    request.headers.set("authorization", "Bearer caller-token");
    await POST(request);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(headers)).not.toMatch(/caller-token|secret/);
    expect(headers).not.toHaveProperty("Cookie");
  });

  it("passes a Flask validation envelope through with its field errors", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(400, {
        error: { code: "VALIDATION_ERROR", message: "Check the submitted fields.", fields: { name: "Must be 1 to 100 characters." } },
      }),
    );
    const response = await call({ cookie: COOKIE, body: { name: "x" } });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ name: "Must be 1 to 100 characters." });
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a Flask 401 envelope through and clears the session cookie", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }),
    );
    const response = await call({ cookie: COOKIE, body: { name: "Roadmap" } });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expectCleared(response);
  });

  it.each([
    ["a 201 without a data key", () => jsonReply(201, { board: BOARD })],
    ["an empty 201", () => new Response("", { status: 201 })],
    ["HTML with 200", () => new Response("<html>oops</html>", { status: 200 })],
    ["a Flask 500 envelope", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "x" } })],
    ["a Flask 503 envelope", () => jsonReply(503, { error: { code: "SERVICE_UNAVAILABLE", message: "x" } })],
    ["a 4xx without an envelope", () => new Response("<html>nope</html>", { status: 422 })],
    ["a redirect", () => new Response("", { status: 302, headers: { Location: "https://evil.example/" } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
  ])("returns 503 and sets no cookie for %s", async (_label, make) => {
    fetchMock.mockImplementation(async () => make());
    const response = await call({ cookie: COOKIE, body: { name: "Roadmap" } });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(setCookies(response)).toEqual([]);
  });

  it("marks success and error responses private with a request id", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: BOARD }));
    const ok = await call({ cookie: COOKIE, body: { name: "Roadmap" } });
    const denied = await call({ origin: null, body: { name: "Roadmap" } });
    for (const response of [ok, denied]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-request-id")).toBeTruthy();
    }
  });
});
