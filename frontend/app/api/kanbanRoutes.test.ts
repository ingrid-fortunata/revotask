// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import * as boardColumns from "./boards/[id]/columns/route";
import * as boardColumnsReorder from "./boards/[id]/columns/reorder/route";
import * as board from "./boards/[id]/route";
import * as boardMembers from "./boards/[id]/members/route";
import * as card from "./cards/[id]/route";
import * as cardPosition from "./cards/[id]/position/route";
import * as columnCards from "./columns/[id]/cards/route";
import * as column from "./columns/[id]/route";

// Route Handlers added by the kanban slice (E07 and E10 reads, E13 to E20 writes). One table covers
// the shared handler rules: exact Origin (403), cookie bearer (401), UUID path (400), key checks
// (400), forwarding, pass-through and private headers (Requirement 11.1, 11.4).

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

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
  flaskPath: (id: string) => string;
  body?: Record<string, unknown>;
  unknown?: Record<string, unknown>;
  /** A body that is missing a required key. Absent when no key is required. */
  missing?: Record<string, unknown>;
  status: number;
};

const WRITES: Write[] = [
  {
    name: "E13 POST /api/boards/[id]/columns",
    method: "POST",
    handler: boardColumns.POST,
    path: (id) => `/api/boards/${id}/columns`,
    flaskPath: (id) => `/api/boards/${id}/columns`,
    body: { name: "To do", is_done: false },
    unknown: { name: "x", color: "red" },
    missing: { is_done: true },
    status: 201,
  },
  {
    name: "E16 PATCH /api/boards/[id]/columns/reorder",
    method: "PATCH",
    handler: boardColumnsReorder.PATCH,
    path: (id) => `/api/boards/${id}/columns/reorder`,
    flaskPath: (id) => `/api/boards/${id}/columns/reorder`,
    body: { column_id: OTHER, before_column_id: null, expected_position_version: 3 },
    unknown: { column_id: OTHER, before_column_id: null, expected_position_version: 3, x: 1 },
    missing: { column_id: OTHER, expected_position_version: 3 },
    status: 200,
  },
  {
    name: "E14 PATCH /api/columns/[id]",
    method: "PATCH",
    handler: column.PATCH,
    path: (id) => `/api/columns/${id}`,
    flaskPath: (id) => `/api/columns/${id}`,
    body: { name: "Doing" },
    unknown: { name: "x", order: 5 },
    status: 200,
  },
  {
    name: "E15 DELETE /api/columns/[id]",
    method: "DELETE",
    handler: column.DELETE,
    path: (id) => `/api/columns/${id}`,
    flaskPath: (id) => `/api/columns/${id}`,
    status: 200,
  },
  {
    name: "E17 POST /api/columns/[id]/cards",
    method: "POST",
    handler: columnCards.POST,
    path: (id) => `/api/columns/${id}/cards`,
    flaskPath: (id) => `/api/columns/${id}/cards`,
    body: { title: "Fix login", description: null, assignee_id: null },
    unknown: { title: "x", column_id: OTHER },
    missing: { description: "only a description" },
    status: 201,
  },
  {
    name: "E18 PATCH /api/cards/[id]",
    method: "PATCH",
    handler: card.PATCH,
    path: (id) => `/api/cards/${id}`,
    flaskPath: (id) => `/api/cards/${id}`,
    body: { title: "Edited" },
    unknown: { title: "x", order: 1 },
    status: 200,
  },
  {
    name: "E19 DELETE /api/cards/[id]",
    method: "DELETE",
    handler: card.DELETE,
    path: (id) => `/api/cards/${id}`,
    flaskPath: (id) => `/api/cards/${id}`,
    status: 200,
  },
  {
    name: "E20 PATCH /api/cards/[id]/position",
    method: "PATCH",
    handler: cardPosition.PATCH,
    path: (id) => `/api/cards/${id}/position`,
    flaskPath: (id) => `/api/cards/${id}/position`,
    body: { column_id: OTHER, before_card_id: null, expected_position_version: 1 },
    unknown: { column_id: OTHER, before_card_id: null, expected_position_version: 1, x: 1 },
    missing: { column_id: OTHER, expected_position_version: 1 },
    status: 200,
  },
];

function writeRequest(spec: Write, options: { origin?: string | null; cookie?: string; body?: unknown; raw?: string; id?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (spec.body !== undefined || options.raw !== undefined) headers["content-type"] = "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
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
    it("returns 400 for a missing required key and calls nothing", async () => {
      const response = await send(spec, { cookie: COOKIE, body: spec.missing });
      expect(response.status).toBe(400);
      expect(Object.values((await response.json()).error.fields)).toContain("Required.");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("forwards the method, path, body and cookie bearer, and passes the data through", async () => {
    fetchMock.mockResolvedValue(jsonReply(spec.status, { data: { position_version: 4 } }));
    const response = await send(spec, { cookie: `${COOKIE}; other=secret`, body });
    expect(response.status).toBe(spec.status);
    expect(await response.json()).toEqual({ data: { position_version: 4 } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}${spec.flaskPath(ID)}`);
    expect(init.method).toBe(spec.method);
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(init.headers)).not.toMatch(/secret/);
    if (body) expect(JSON.parse(init.body)).toEqual(body);
    else expect(init.body).toBeUndefined();
  });

  it.each([
    [409, "POSITION_CONFLICT"],
    [409, "STATE_CONFLICT"],
    [400, "VALIDATION_ERROR"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
  ])("passes a Flask %i %s envelope through and keeps the cookie", async (status, code) => {
    fetchMock.mockResolvedValue(
      jsonReply(status, { error: { code, message: "Fixed message.", fields: { name: "Bad." } } }),
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

type Read = { name: string; handler: Handler; path: (id: string) => string; flask: (id: string) => string };
const READS: Read[] = [
  { name: "E07 GET /api/boards/[id]", handler: board.GET, path: (id) => `/api/boards/${id}`, flask: (id) => `/api/boards/${id}` },
  {
    name: "E10 GET /api/boards/[id]/members",
    handler: boardMembers.GET,
    path: (id) => `/api/boards/${id}/members`,
    flask: (id) => `/api/boards/${id}/members`,
  },
];

function readRequest(read: Read, options: { cookie?: string; origin?: string; id?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.origin) headers.origin = options.origin;
  return new NextRequest(`${APP_ORIGIN}${read.path(options.id ?? ID)}`, { method: "GET", headers });
}

describe.each(READS)("$name", (read) => {
  const send = (options: Parameters<typeof readRequest>[1] = {}) =>
    read.handler(readRequest(read, options), { params: Promise.resolve({ id: options.id ?? ID }) });

  it("returns 401 with no cookie, clears it and calls nothing", async () => {
    const response = await send();
    expect(response.status).toBe(401);
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-UUID ID without calling Flask", async () => {
    const response = await send({ cookie: COOKIE, id: "../x" });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("needs no Origin, forwards a GET with the cookie bearer and returns the data no-store", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: { id: ID } }));
    const response = await send({ cookie: `${COOKIE}; other=secret` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: ID } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}${read.flask(ID)}`);
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
