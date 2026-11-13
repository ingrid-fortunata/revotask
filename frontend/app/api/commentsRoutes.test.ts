// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import * as cardComments from "./cards/[id]/comments/route";
import * as comment from "./comments/[id]/route";

// Route Handlers added by the comments slice (E23 read, E24 to E26 writes). One table covers the
// shared handler rules: exact Origin (403), cookie bearer (401), UUID path (400), key checks (400),
// forwarding, pass-through and private headers (Requirements 5.6, 9.1, 9.2).

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

type Handler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Write = {
  name: string;
  method: "POST" | "PATCH" | "DELETE";
  handler: Handler;
  path: (id: string) => string;
  body?: Record<string, unknown>;
  unknown?: Record<string, unknown>;
  missing?: Record<string, unknown>;
  status: number;
};

const WRITES: Write[] = [
  {
    name: "E24 POST /api/cards/[id]/comments",
    method: "POST",
    handler: cardComments.POST,
    path: (id) => `/api/cards/${id}/comments`,
    body: { content: "Looks good" },
    unknown: { content: "x", author_id: ID },
    missing: {},
    status: 201,
  },
  {
    name: "E25 PATCH /api/comments/[id]",
    method: "PATCH",
    handler: comment.PATCH,
    path: (id) => `/api/comments/${id}`,
    body: { content: "Edited" },
    unknown: { content: "x", card_id: ID },
    missing: {},
    status: 200,
  },
  {
    name: "E26 DELETE /api/comments/[id]",
    method: "DELETE",
    handler: comment.DELETE,
    path: (id) => `/api/comments/${id}`,
    status: 200,
  },
];

function writeRequest(spec: Write, options: { origin?: string | null; cookie?: string; body?: unknown; id?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (spec.body !== undefined) headers["content-type"] = "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new NextRequest(`${APP_ORIGIN}${spec.path(options.id ?? ID)}`, { method: spec.method, headers, body });
}

const send = (spec: Write, options: Parameters<typeof writeRequest>[1] = {}) =>
  spec.handler(writeRequest(spec, options), { params: Promise.resolve({ id: options.id ?? ID }) });

function expectCleared(response: Response) {
  const cookies = setCookies(response);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^revotask_session=;/);
  expect(cookies[0]).toMatch(/Max-Age=0/i);
}

describe.each(WRITES)("$name", (spec) => {
  const body = spec.body;

  it("returns 403 for a missing or mismatched Origin and calls nothing", async () => {
    for (const origin of [null, "http://evil.example"]) {
      const response = await send(spec, { origin, cookie: COOKIE, body });
      expect(response.status).toBe(403);
      expect(setCookies(response)).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 with no cookie, clears it and makes no upstream call", async () => {
    const response = await send(spec, { body });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "..", "a%2Fb", `${ID}/../x`])("returns 400 for the non-UUID ID %j", async (id) => {
    const response = await send(spec, { cookie: COOKIE, body, id });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  if (spec.unknown) {
    it("returns 400 for an unknown key and calls nothing", async () => {
      const response = await send(spec, { cookie: COOKIE, body: spec.unknown });
      expect(response.status).toBe(400);
      expect(Object.values((await response.json()).error.fields)).toContain("Unknown field.");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  if (spec.missing) {
    it("returns 400 for a missing content key and calls nothing", async () => {
      const response = await send(spec, { cookie: COOKIE, body: spec.missing });
      expect(response.status).toBe(400);
      expect(Object.values((await response.json()).error.fields)).toContain("Required.");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("forwards the method, path, body and cookie bearer, and passes the data through", async () => {
    fetchMock.mockResolvedValue(jsonReply(spec.status, { data: { id: ID } }));
    const response = await send(spec, { cookie: `${COOKIE}; other=secret`, body });
    expect(response.status).toBe(spec.status);
    expect(await response.json()).toEqual({ data: { id: ID } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}${spec.path(ID)}`);
    expect(init.method).toBe(spec.method);
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(init.headers)).not.toMatch(/secret/);
    if (body) expect(JSON.parse(init.body)).toEqual(body);
    else expect(init.body).toBeUndefined();
  });

  it.each([
    [400, "VALIDATION_ERROR"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
  ])("passes a Flask %i %s envelope through and keeps the cookie", async (status, code) => {
    fetchMock.mockResolvedValue(
      jsonReply(status, { error: { code, message: "Fixed message.", fields: { content: "Bad." } } }),
    );
    const response = await send(spec, { cookie: COOKIE, body });
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(setCookies(response)).toEqual([]);
  });

  it("clears the cookie on a Flask 401", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }));
    expectCleared(await send(spec, { cookie: COOKIE, body }));
  });

  it.each([
    ["a 2xx without data", () => jsonReply(spec.status, { nope: 1 })],
    ["a Flask 500", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "x" } })],
    ["a redirect", () => new Response("", { status: 302, headers: { Location: "https://evil.example/" } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
  ])("returns 503 for %s", async (_label, make) => {
    fetchMock.mockImplementation(async () => make());
    const response = await send(spec, { cookie: COOKIE, body });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("E23 GET /api/cards/[id]/comments", () => {
  const send = (options: { cookie?: string; origin?: string; id?: string } = {}) => {
    const headers: Record<string, string> = {};
    if (options.cookie) headers.cookie = options.cookie;
    if (options.origin) headers.origin = options.origin;
    const id = options.id ?? ID;
    return cardComments.GET(new NextRequest(`${APP_ORIGIN}/api/cards/${id}/comments`, { method: "GET", headers }), {
      params: Promise.resolve({ id }),
    });
  };

  it("returns 401 with no cookie, clears it and calls nothing", async () => {
    const response = await send();
    expect(response.status).toBe(401);
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-UUID ID without calling Flask", async () => {
    expect((await send({ cookie: COOKIE, id: "../x" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("needs no Origin, forwards a GET with the cookie bearer and returns the data no-store", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: [] }));
    const response = await send({ cookie: `${COOKIE}; other=secret` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/cards/${ID}/comments`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(init.body).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toMatch(/secret/);
  });

  it("passes a Flask 404 through, keeps the cookie, and clears it on a 401", async () => {
    fetchMock.mockResolvedValue(jsonReply(404, { error: { code: "NOT_FOUND", message: "Resource not found." } }));
    const notFound = await send({ cookie: COOKIE });
    expect(notFound.status).toBe(404);
    expect(setCookies(notFound)).toEqual([]);
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }));
    expectCleared(await send({ cookie: COOKIE }));
  });

  it("returns 503 for an unreachable Flask or a reply without data", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));
    expect((await send({ cookie: COOKIE })).status).toBe(503);
    fetchMock.mockResolvedValue(jsonReply(200, { nope: 1 }));
    expect((await send({ cookie: COOKIE })).status).toBe(503);
  });
});
