// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import { GET } from "./boards/[id]/cards/search/route";

// E22 handler (task 3.2; Requirements 8.1, 8.6; Property 11). The handler forwards the query
// string exactly as received, so Flask does the validation and the handler never parses `q`.

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

const send = (query: string, options: { cookie?: string; id?: string } = {}) => {
  const id = options.id ?? ID;
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  return GET(new NextRequest(`${APP_ORIGIN}/api/boards/${id}/cards/search${query}`, { method: "GET", headers }), {
    params: Promise.resolve({ id }),
  });
};

const upstreamUrl = () => String(fetchMock.mock.calls[0][0]);

describe("E22 GET /api/boards/[id]/cards/search", () => {
  it("forwards one q with the cookie bearer and passes the data through, private and no-store", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: [{ id: "c", title: "T", column_id: "k" }] }));
    const response = await send("?q=report", { cookie: `${COOKIE}; other=secret` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: "c", title: "T", column_id: "k" }] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/boards/${ID}/cards/search?q=report`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(init.headers)).not.toMatch(/secret/);
  });

  it.each([
    ["a repeated q", "?q=a&q=b", { q: "Send one value." }],
    ["an unknown key beside q", "?q=a&foo=bar", null],
    ["a blank q", "?q=", { q: "Required." }],
    ["a missing q", "", { q: "Required." }],
    ["a NUL q (Q4)", "?q=%00", { q: "Enter valid text." }],
    ["a NUL inside text", "?q=ab%00cd", { q: "Enter valid text." }],
  ])("forwards %s exactly as sent and passes the Flask 400 through", async (_label, query, fields) => {
    const error: Record<string, unknown> = { code: "VALIDATION_ERROR", message: "Check the submitted fields." };
    if (fields) error.fields = fields;
    fetchMock.mockResolvedValue(jsonReply(400, { error }));
    const response = await send(query, { cookie: COOKIE });
    expect(upstreamUrl()).toBe(`${API_BASE_URL}/api/boards/${ID}/cards/search${query}`);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fields).toEqual(fields ?? undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an encoded query byte for byte", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: [] }));
    await send("?q=a%26b%20%2350%25", { cookie: COOKIE });
    expect(upstreamUrl()).toBe(`${API_BASE_URL}/api/boards/${ID}/cards/search?q=a%26b%20%2350%25`);
  });

  it.each(["not-a-uuid", "..", "a%2Fb", `${ID}/../x`])("returns 400 for the non-UUID board ID %j without a call", async (id) => {
    const response = await send("?q=a", { cookie: COOKIE, id });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 with no cookie, clears it and makes no upstream call", async () => {
    const response = await send("?q=a");
    expect(response.status).toBe(401);
    const cookies = setCookies(response);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^revotask_session=;/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the cookie on a Flask 401", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }));
    const response = await send("?q=a", { cookie: COOKIE });
    expect(response.status).toBe(401);
    expect(setCookies(response)[0]).toMatch(/Max-Age=0/i);
  });

  it("passes the generic 404 through and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(404, { error: { code: "NOT_FOUND", message: "Not found." } }));
    const response = await send("?q=a", { cookie: COOKIE });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(setCookies(response)).toEqual([]);
  });

  it.each([
    ["a Flask 500", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "x" } })],
    ["a redirect", () => new Response("", { status: 302, headers: { Location: "https://evil.example/" } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
  ])("returns 503 for %s", async (_label, make) => {
    fetchMock.mockImplementation(async () => make());
    const response = await send("?q=a", { cookie: COOKIE });
    expect(response.status).toBe(503);
  });
});
