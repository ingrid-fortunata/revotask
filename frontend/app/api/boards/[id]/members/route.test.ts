// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, jsonReply, setCookies } from "@/lib/server/testSupport";
import { POST } from "./route";

const fetchMock = vi.fn();
const COOKIE = "revotask_session=tok-sentinel-123";
const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER = { user_id: "22222222-2222-4222-8222-222222222222", name: "Ada", role: "member" };
const EMAIL = { email: "ada@example.com" };

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

function memberRequest(options: RequestOptions = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? APP_ORIGIN;
  if (options.contentType !== null) headers["content-type"] = options.contentType ?? "application/json";
  if (options.cookie) headers.cookie = options.cookie;
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new NextRequest(`${APP_ORIGIN}/api/boards/${BOARD_ID}/members`, { method: "POST", headers, body });
}

const call = (options: RequestOptions = {}, id = BOARD_ID) =>
  POST(memberRequest(options), { params: Promise.resolve({ id }) });

function expectCleared(response: Response) {
  const cookies = setCookies(response);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^revotask_session=;/);
  expect(cookies[0]).toMatch(/Max-Age=0/i);
  expect(cookies[0]).toMatch(/Path=\//);
  expect(cookies[0]).toMatch(/SameSite=lax/i);
  expect(cookies[0]).not.toMatch(/Domain/i);
}

describe("POST /api/boards/[id]/members", () => {
  it("returns 403 for a missing or mismatched Origin and calls nothing", async () => {
    for (const origin of [null, "http://evil.example"]) {
      const response = await call({ origin, cookie: COOKIE, body: EMAIL });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(setCookies(response)).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 with no cookie, clears the cookie and makes no upstream call", async () => {
    const response = await call({ body: EMAIL });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expectCleared(response);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "..", "a%2Fb", "11111111-1111-4111-8111-111111111111/../x"])(
    "returns 400 for the non-UUID board ID %j without calling Flask",
    async (id) => {
      const response = await call({ cookie: COOKIE, body: EMAIL }, id);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("returns 415 for a non-JSON Content-Type without calling Flask", async () => {
    const response = await call({ cookie: COOKIE, contentType: "text/plain", raw: '{"email":"ada@example.com"}' });
    expect(response.status).toBe(415);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 413 for a body over 64 KiB without calling Flask", async () => {
    const response = await call({ cookie: COOKIE, raw: JSON.stringify({ email: `${"a".repeat(70_000)}@example.com` }) });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("CONTENT_TOO_LARGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{oops"],
    ["a JSON array", "[]"],
  ])("returns 400 for %s without calling Flask", async (_label, raw) => {
    const response = await call({ cookie: COOKIE, raw });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 with field errors for an unknown key or a missing email and calls nothing", async () => {
    const unknown = await call({ cookie: COOKIE, body: { email: "ada@example.com", role: "admin" } });
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error.fields).toEqual({ role: "Unknown field." });

    const missing = await call({ cookie: COOKIE, body: {} });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.fields).toEqual({ email: "Required." });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the email as POST to the board members path with the cookie bearer and returns 201 with the membership", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: MEMBER }));
    const response = await call({ cookie: COOKIE, body: EMAIL });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: MEMBER });
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/boards/${BOARD_ID}/members`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.parse(init.body)).toEqual(EMAIL);
  });

  it("does not forward the caller's Authorization header or other cookies", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: MEMBER }));
    const request = memberRequest({ cookie: `${COOKIE}; other=secret`, body: EMAIL });
    request.headers.set("authorization", "Bearer caller-token");
    await POST(request, { params: Promise.resolve({ id: BOARD_ID }) });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer tok-sentinel-123");
    expect(JSON.stringify(headers)).not.toMatch(/caller-token|secret/);
    expect(headers).not.toHaveProperty("Cookie");
  });

  it("passes a Flask USER_NOT_FOUND 404 through without fields and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(404, { error: { code: "USER_NOT_FOUND", message: "No registered user has this email." } }),
    );
    const response = await call({ cookie: COOKIE, body: EMAIL });
    expect(response.status).toBe(404);
    const error = (await response.json()).error;
    expect(error.code).toBe("USER_NOT_FOUND");
    expect(error).not.toHaveProperty("fields");
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a Flask 409 STATE_CONFLICT through and keeps the cookie", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(409, { error: { code: "STATE_CONFLICT", message: "This user is already a member of the board." } }),
    );
    const response = await call({ cookie: COOKIE, body: EMAIL });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("STATE_CONFLICT");
    expect(setCookies(response)).toEqual([]);
  });

  it("passes a Flask 400 envelope with fields through", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(400, {
        error: { code: "VALIDATION_ERROR", message: "Check the submitted fields.", fields: { email: "Enter a valid email address." } },
      }),
    );
    const response = await call({ cookie: COOKIE, body: { email: "not-an-email" } });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ email: "Enter a valid email address." });
  });

  it("passes a Flask 401 envelope through and clears the session cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }));
    const response = await call({ cookie: COOKIE, body: EMAIL });
    expect(response.status).toBe(401);
    expectCleared(response);
  });

  it.each([
    ["a 201 without a data key", () => jsonReply(201, { member: MEMBER })],
    ["HTML with 201", () => new Response("<html>oops</html>", { status: 201 })],
    ["a Flask 500 envelope", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "x" } })],
    ["a 4xx without an envelope", () => new Response("<html>nope</html>", { status: 404 })],
    ["a redirect", () => new Response("", { status: 302, headers: { Location: "https://evil.example/" } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
  ])("returns 503 and sets no cookie for %s", async (_label, make) => {
    fetchMock.mockImplementation(async () => make());
    const response = await call({ cookie: COOKIE, body: EMAIL });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(setCookies(response)).toEqual([]);
  });

  it("marks responses private with a request id", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: MEMBER }));
    const response = await call({ origin: null, body: EMAIL });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
