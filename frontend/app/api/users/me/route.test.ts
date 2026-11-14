// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES } from "@/lib/server/bff";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import * as route from "./route";

// The Profile_Handler (E31, Requirement 8.1, 8.2): exact Origin (403), cookie bearer (401), JSON
// checks (415, 413, 400), the key set, forwarding, pass-through and private headers.

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";
const USER = { id: "11111111-1111-4111-8111-111111111111", name: "Ada", email: "ada@example.com" };

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

type Options = { origin?: string | null; cookie?: string | null; body?: unknown; raw?: string; contentType?: string | null };

function patch(options: Options = {}) {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (options.contentType !== null) headers["content-type"] = options.contentType ?? "application/json";
  if (options.cookie !== null) headers.cookie = options.cookie ?? COOKIE;
  const body = options.raw ?? (options.body === undefined ? JSON.stringify({ name: "Ada" }) : JSON.stringify(options.body));
  return route.PATCH(new NextRequest(`${APP_ORIGIN}/api/users/me`, { method: "PATCH", headers, body }));
}

function expectCleared(response: Response) {
  const cookies = setCookies(response);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^revotask_session=;/);
  expect(cookies[0]).toMatch(/Max-Age=0/i);
}

describe("PATCH /api/users/me", () => {
  it("exports PATCH only", () => {
    expect(Object.keys(route).sort()).toEqual(["PATCH"]);
  });

  it("returns 403 for a missing or mismatched Origin and calls nothing", async () => {
    for (const origin of [null, "http://evil.example"]) {
      const response = await patch({ origin });
      expect(response.status).toBe(403);
      expect(setCookies(response)).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 with no cookie, clears it and makes no upstream call", async () => {
    const response = await patch({ cookie: null });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 415 for another media type and calls nothing", async () => {
    const response = await patch({ contentType: "text/plain" });
    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 413 for a body above the limit and calls nothing", async () => {
    const response = await patch({ raw: JSON.stringify({ name: "a".repeat(MAX_BODY_BYTES) }) });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("CONTENT_TOO_LARGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([["malformed JSON", "{not json"], ["an array", "[]"], ["a string", '"x"'], ["null", "null"]])(
    "returns 400 for %s and calls nothing",
    async (_label, raw) => {
      const response = await patch({ raw });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ password: "Horse-Battery-42" }, ["password"]],
    [{ name: "Ada", password: "Horse-Battery-42" }, ["password"]],
    [{ current_password: "x", id: "1" }, ["current_password", "id"]],
    [{ email: "a@b.co", created_at: "2026-01-01" }, ["created_at"]],
  ])("returns 400 with Unknown field. for %j and does not forward it", async (body, keys) => {
    const response = await patch({ body });
    expect(response.status).toBe(400);
    const error = (await response.json()).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields).toEqual(Object.fromEntries(keys.map((key) => [key, "Unknown field."])));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards an empty object, because Flask decides that nothing to update is a 400", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(400, { error: { code: "VALIDATION_ERROR", message: "Check the submitted fields." } }),
    );
    const response = await patch({ body: {} });
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });

  it.each([{ name: "Ada" }, { email: "ada@example.com" }, { name: "Ada", email: "ada@example.com" }])(
    "forwards %j with the cookie bearer and passes the user through",
    async (body) => {
      fetchMock.mockResolvedValue(jsonReply(200, { data: USER }));
      const response = await patch({ body, cookie: `${COOKIE}; other=secret` });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: USER });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-request-id")).toBeTruthy();
      expect(setCookies(response)).toEqual([]);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe(`${API_BASE_URL}/api/users/me`);
      expect(init.method).toBe("PATCH");
      expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
      expect(JSON.stringify(init.headers)).not.toMatch(/secret/);
      expect(JSON.parse(init.body)).toEqual(body);
    },
  );

  it("never puts the token in the response", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: USER }));
    const response = await patch({ body: { name: "Ada" } });
    expect(JSON.stringify([...response.headers.entries()]) + (await response.text())).not.toMatch(/tok-sentinel/);
  });

  it.each([
    [400, "VALIDATION_ERROR", { name: "Must be 1 to 80 characters." }],
    [409, "EMAIL_ALREADY_EXISTS", undefined],
  ])("passes a Flask %i %s envelope through and keeps the cookie", async (status, code, fields) => {
    fetchMock.mockResolvedValue(jsonReply(status, { error: { code, message: "Fixed message.", fields } }));
    const response = await patch({ body: { email: "taken@example.com" } });
    expect(response.status).toBe(status);
    const error = (await response.json()).error;
    expect(error.code).toBe(code);
    expect(error.fields).toEqual(fields);
    expect(setCookies(response)).toEqual([]);
  });

  it("clears the cookie on a Flask 401", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }));
    expectCleared(await patch());
  });

  it.each([
    ["a 2xx without data", () => jsonReply(200, { nope: 1 })],
    ["a Flask 500", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "x" } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
  ])("returns 503 for %s", async (_label, make) => {
    fetchMock.mockImplementation(async () => make());
    const response = await patch();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
