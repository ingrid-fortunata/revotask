// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import { PATCH } from "./notifications/[id]/read/route";
import { GET } from "./notifications/route";

// Route Handlers added by the notifications slice (E27 read, E28 write; Requirements 10.1, 10.2,
// 10.5). GET forwards the query unchanged. PATCH checks the Origin and the UUID, and forwards no body.

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";
const ID = "11111111-1111-4111-8111-111111111111";

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

function expectCleared(response: Response) {
  const cookies = setCookies(response);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^revotask_session=;/);
  expect(cookies[0]).toMatch(/Max-Age=0/i);
}

const list = (query: string, cookie?: string) =>
  GET(new NextRequest(`${APP_ORIGIN}/api/notifications${query}`, { method: "GET", headers: cookie ? { cookie } : {} }));

const mark = (options: { origin?: string | null; cookie?: string; id?: string; body?: string } = {}) => {
  const id = options.id ?? ID;
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return PATCH(
    new NextRequest(`${APP_ORIGIN}/api/notifications/${id}/read`, { method: "PATCH", headers, body: options.body }),
    { params: Promise.resolve({ id }) },
  );
};

describe("E27 GET /api/notifications", () => {
  it("forwards the query and the cookie bearer, passes the data through, private and no-store", async () => {
    const data = { items: [], page: 2, per_page: 20, total: 0, unread_count: 0 };
    fetchMock.mockResolvedValue(jsonReply(200, { data }));
    const response = await list("?page=2&per_page=20", `${COOKIE}; other=secret`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/notifications?page=2&per_page=20`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(init.headers)).not.toMatch(/secret/);
  });

  it.each([
    ["a repeated page", "?page=1&page=2", { page: "Send one value." }],
    ["an unknown key", "?page=1&foo=bar", null],
    ["a bad number", "?page=0", { page: "Must be a whole number from 1 to 2147483647." }],
    ["an encoded value", "?page=%2B1&per_page=%201", { page: "x" }],
  ])("forwards %s exactly as sent and passes the Flask 400 through", async (_label, query, fields) => {
    const error: Record<string, unknown> = { code: "VALIDATION_ERROR", message: "Check the submitted fields." };
    if (fields) error.fields = fields;
    fetchMock.mockResolvedValue(jsonReply(400, { error }));
    const response = await list(query, COOKIE);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${API_BASE_URL}/api/notifications${query}`);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 with no cookie, clears it and makes no upstream call", async () => {
    const response = await list("");
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the cookie on an upstream 401 and returns no token", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Sign in." } }));
    const response = await list("", COOKIE);
    expect(response.status).toBe(401);
    expectCleared(response);
    expect(JSON.stringify(await response.json())).not.toMatch(/tok-sentinel/);
  });
});

describe("E28 PATCH /api/notifications/[id]/read", () => {
  it("returns 403 for a missing or mismatched Origin and calls nothing", async () => {
    for (const origin of [null, "http://evil.example"]) {
      const response = await mark({ origin, cookie: COOKIE });
      expect(response.status).toBe(403);
      expect(setCookies(response)).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 with no cookie, clears it and makes no upstream call", async () => {
    const response = await mark();
    expect(response.status).toBe(401);
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "..", "a%2Fb", `${ID}/../x`])("returns 400 for the non-UUID ID %j before any upstream call", async (id) => {
    const response = await mark({ cookie: COOKIE, id });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the method, path and cookie bearer with no body, and passes the data through", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: { id: ID } }));
    const response = await mark({ cookie: `${COOKIE}; other=secret` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: ID } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/notifications/${ID}/read`);
    expect(init.method).toBe("PATCH");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(init.headers)).not.toMatch(/secret/);
    expect(init.body).toBeUndefined();
  });

  it("forwards no body even when the browser sends one", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: { id: ID } }));
    await mark({ cookie: COOKIE, body: JSON.stringify({ read_at: "2020-01-01" }) });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("passes a Flask 404 through and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(404, { error: { code: "NOT_FOUND", message: "That item was not found." } }));
    const response = await mark({ cookie: COOKIE });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(setCookies(response)).toEqual([]);
  });

  it("clears the cookie on an upstream 401", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Sign in." } }));
    expectCleared(await mark({ cookie: COOKIE }));
  });
});
