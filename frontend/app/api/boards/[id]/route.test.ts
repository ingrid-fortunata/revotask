// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import { DELETE, PATCH } from "./route";

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";
const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const BOARD = { id: BOARD_ID, name: "Renamed", role: "admin", position_version: 0 };

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

type Method = "PATCH" | "DELETE";

type RequestOptions = {
  origin?: string | null;
  cookie?: string;
  body?: unknown;
  raw?: string;
  contentType?: string | null;
};

function boardRequest(method: Method, options: RequestOptions = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (options.contentType !== null) headers["content-type"] = options.contentType ?? "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new NextRequest(`${APP_ORIGIN}/api/boards/${BOARD_ID}`, { method, headers, body });
}

// Next passes the dynamic segment as a Promise of params (Next 15+ contract used by the handlers).
const context = (id: string) => ({ params: Promise.resolve({ id }) });

const patch = (options: RequestOptions = {}, id = BOARD_ID) => PATCH(boardRequest("PATCH", options), context(id));
const del = (options: RequestOptions = {}, id = BOARD_ID) => DELETE(boardRequest("DELETE", options), context(id));

const CALLS: Record<Method, (options?: RequestOptions, id?: string) => Promise<Response>> = {
  PATCH: patch,
  DELETE: del,
};

function expectCleared(response: Response) {
  const cookies = setCookies(response);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^revotask_session=;/);
  expect(cookies[0]).toMatch(/Max-Age=0/i);
  expect(cookies[0]).toMatch(/Path=\//);
  expect(cookies[0]).toMatch(/SameSite=lax/i);
  expect(cookies[0]).not.toMatch(/Domain/i);
}

describe.each(["PATCH", "DELETE"] as const)("%s /api/boards/[id]", (method) => {
  const call = CALLS[method];
  const body = method === "PATCH" ? { name: "Renamed" } : undefined;

  it("returns 403 for a missing or mismatched Origin and calls nothing", async () => {
    for (const origin of [null, "http://evil.example"]) {
      const response = await call({ origin, cookie: COOKIE, body });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(setCookies(response)).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 with no cookie, clears the cookie and makes no upstream call", async () => {
    const response = await call({ body });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "not-a-uuid",
    "",
    "..",
    "a%2Fb",
    "11111111-1111-4111-8111-11111111111?",
    "11111111-1111-4111-8111-111111111111/../members",
  ])("returns 400 for the non-UUID board ID %j without calling Flask", async (id) => {
    const response = await call({ cookie: COOKIE, body }, id);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the board ID before reading the body", async () => {
    const response = await call({ cookie: COOKIE, contentType: "text/plain", raw: "x" }, "not-a-uuid");
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the request as the same method to the board path with the cookie bearer", async () => {
    fetchMock.mockResolvedValue(
      method === "PATCH" ? jsonReply(200, { data: BOARD }) : jsonReply(200, { data: null }),
    );
    const response = await call({ cookie: COOKIE, body });
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/boards/${BOARD_ID}`);
    expect(init.method).toBe(method);
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(setCookies(response)).toEqual([]);
  });

  it("does not forward the caller's Authorization header or other cookies", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: method === "PATCH" ? BOARD : null }));
    const request = boardRequest(method, { cookie: `${COOKIE}; other=secret`, body });
    request.headers.set("authorization", "Bearer caller-token");
    if (method === "PATCH") await PATCH(request, context(BOARD_ID));
    else await DELETE(request, context(BOARD_ID));
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(headers)).not.toMatch(/caller-token|secret/);
    expect(headers).not.toHaveProperty("Cookie");
  });

  it("passes a Flask 403 envelope through and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(403, { error: { code: "FORBIDDEN", message: "Only an admin can do this." } }));
    const response = await call({ cookie: COOKIE, body });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a Flask 404 envelope through and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(404, { error: { code: "NOT_FOUND", message: "Board not found." } }));
    const response = await call({ cookie: COOKIE, body });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a Flask 401 envelope through and clears the session cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }));
    const response = await call({ cookie: COOKIE, body });
    expect(response.status).toBe(401);
    expectCleared(response);
  });

  it.each([
    ["a 200 without a data key", () => jsonReply(200, { board: BOARD })],
    ["HTML with 200", () => new Response("<html>oops</html>", { status: 200 })],
    ["a Flask 500 envelope", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "x" } })],
    ["a 4xx without an envelope", () => new Response("<html>nope</html>", { status: 409 })],
    ["a redirect", () => new Response("", { status: 307, headers: { Location: "https://evil.example/" } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
  ])("returns 503 and sets no cookie for %s", async (_label, make) => {
    fetchMock.mockImplementation(async () => make());
    const response = await call({ cookie: COOKIE, body });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(setCookies(response)).toEqual([]);
  });

  it("marks responses private with a request id", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: method === "PATCH" ? BOARD : null }));
    const response = await call({ origin: null, body });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("PATCH /api/boards/[id] body checks", () => {
  it("returns 415 for a non-JSON Content-Type without calling Flask", async () => {
    const response = await patch({ cookie: COOKIE, contentType: "text/plain", raw: '{"name":"Renamed"}' });
    expect(response.status).toBe(415);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 413 for a body over 64 KiB without calling Flask", async () => {
    const response = await patch({ cookie: COOKIE, raw: JSON.stringify({ name: "a".repeat(70_000) }) });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("CONTENT_TOO_LARGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{oops"],
    ["a JSON array", "[]"],
  ])("returns 400 for %s without calling Flask", async (_label, raw) => {
    const response = await patch({ cookie: COOKIE, raw });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 with a field error for a missing name, an empty body or an unknown key", async () => {
    const missing = await patch({ cookie: COOKIE, body: {} });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.fields).toEqual({ name: "Required." });

    const unknown = await patch({ cookie: COOKIE, body: { name: "Renamed", deleted_at: "now" } });
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error.fields).toEqual({ deleted_at: "Unknown field." });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the name as the JSON body of PATCH", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: BOARD }));
    const response = await patch({ cookie: COOKIE, body: { name: "Renamed" } });
    expect(await response.json()).toEqual({ data: BOARD });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ name: "Renamed" });
  });

  it("passes a Flask 400 envelope with fields through", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(400, {
        error: { code: "VALIDATION_ERROR", message: "Check the submitted fields.", fields: { name: "Must be 1 to 100 characters." } },
      }),
    );
    const response = await patch({ cookie: COOKIE, body: { name: "x" } });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ name: "Must be 1 to 100 characters." });
  });
});

describe("DELETE /api/boards/[id] request shape", () => {
  it("sends no body and no Content-Type to Flask", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: null }));
    const response = await del({ cookie: COOKIE });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty("Content-Type");
  });
});
