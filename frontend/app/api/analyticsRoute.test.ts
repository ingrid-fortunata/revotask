// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import { GET } from "./boards/[id]/analytics/route";

// E29 handler (task 3.2; Requirement 8.1). The handler forwards the query string exactly as
// received, so Flask does the validation and the handler never reads a parameter.

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";
const ID = "11111111-1111-4111-8111-111111111111";
const DATA = {
  week_start: "2026-11-09T00:00:00Z",
  week_end: "2026-11-16T00:00:00Z",
  cards_per_column: [],
  completed_cards: 0,
  member_activity: [],
};

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

const send = (query = "", options: { cookie?: string; id?: string } = {}) => {
  const id = options.id ?? ID;
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  return GET(
    new NextRequest(`${APP_ORIGIN}/api/boards/${id}/analytics${query}`, { method: "GET", headers }),
    { params: Promise.resolve({ id }) },
  );
};

describe("E29 GET /api/boards/[id]/analytics", () => {
  it("forwards to the E29 path with the cookie bearer, private and no-store, and passes data through", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { data: DATA }));
    const response = await send("", { cookie: `${COOKIE}; other=secret` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: DATA });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/boards/${ID}/analytics`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(init.headers)).not.toMatch(/secret/);
  });

  it("forwards a query string unchanged and passes the Flask 400 through", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(400, {
        error: { code: "VALIDATION_ERROR", message: "Check the submitted fields.", request_id: "r" },
      }),
    );
    const response = await send("?week=1&week=2&x=%00", { cookie: COOKIE });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${API_BASE_URL}/api/boards/${ID}/analytics?week=1&week=2&x=%00`,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it.each(["not-a-uuid", "..", "1234"])("answers a non-UUID id %s with 400 before any upstream call", async (id) => {
    const response = await send("", { cookie: COOKIE, id });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a missing cookie with 401 and no upstream call", async () => {
    const response = await send("");
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the session cookie when Flask answers 401", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Sign in.", request_id: "r" } }),
    );
    const response = await send("", { cookie: COOKIE });
    expect(response.status).toBe(401);
    expect(setCookies(response).join(";")).toMatch(/revotask_session=;/);
  });

  it("passes a Flask 404 through and never puts the token in the body", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(404, { error: { code: "NOT_FOUND", message: "Not found.", request_id: "r" } }),
    );
    const response = await send("", { cookie: COOKIE });
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("tok-sentinel-123");
  });
});
