// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, APP_ORIGIN, authRequest, jsonReply, setCookies } from "@/lib/server/testSupport";
import { POST } from "./route";

const fetchMock = vi.fn();
const VALID = { name: "Ada", email: "ada@example.com", password: "Horse-Battery-42" };

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

const call = (options: Parameters<typeof authRequest>[1]) => POST(authRequest("/api/auth/register", options));

describe("POST /api/auth/register", () => {
  it.each([[null], ["http://evil.example"], ["http://localhost:3000.evil.example"], ["null"]])(
    "returns 403 for Origin %s without calling Flask or touching cookies",
    async (origin) => {
      const response = await call({ origin, body: VALID });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(setCookies(response)).toEqual([]);
    },
  );

  it("returns 415 for a non-JSON content type and 413 for a large body, without calling Flask", async () => {
    expect((await call({ raw: "{}", contentType: "text/plain" })).status).toBe(415);
    expect((await call({ raw: "{}", contentType: null })).status).toBe(415);
    const big = JSON.stringify({ ...VALID, name: "a".repeat(70_000) });
    expect((await call({ raw: big })).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a bad body, an extra key or a missing key, without calling Flask", async () => {
    expect((await call({ raw: "{oops" })).status).toBe(400);
    expect((await call({ raw: "[]" })).status).toBe(400);
    const extra = await call({ body: { ...VALID, role: "admin" } });
    expect(extra.status).toBe(400);
    expect((await extra.json()).error.fields).toEqual({ role: "Unknown field." });
    const missing = await call({ body: { name: "Ada", email: "a@b.co" } });
    expect((await missing.json()).error.fields).toEqual({ password: "Required." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards exactly the three fields to the register path and returns 201 with no cookie", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: { id: "1", name: "Ada", email: "ada@example.com" } }));
    const response = await call({ body: VALID });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { id: "1", name: "Ada", email: "ada@example.com" } });
    expect(setCookies(response)).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/auth/register`);
    expect(JSON.parse(init.body)).toEqual(VALID);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    [400, { error: { code: "VALIDATION_ERROR", message: "Check.", fields: { email: "Enter a valid email address." }, request_id: "f" } }],
    [409, { error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists." } }],
    [429, { error: { code: "RATE_LIMITED", message: "Too many requests." } }],
  ])("passes a Flask %s through with its envelope", async (status, body) => {
    fetchMock.mockResolvedValue(jsonReply(status, body, status === 429 ? { "Retry-After": "12" } : {}));
    const response = await call({ body: VALID });
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(body.error.code);
    expect(response.headers.get("retry-after")).toBe(status === 429 ? "12" : null);
    expect(setCookies(response)).toEqual([]);
  });

  it("returns 503 when Flask is unreachable or sends HTML", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("down"));
    expect((await call({ body: VALID })).status).toBe(503);
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    const response = await call({ body: VALID });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/Bad gateway/);
  });

  it("forwards the request id, adds no caller headers and returns the id", async () => {
    fetchMock.mockResolvedValue(jsonReply(201, { data: {} }));
    const request = authRequest("/api/auth/register", { body: VALID });
    request.headers.set("authorization", "Bearer caller-token");
    request.headers.set("x-forwarded-host", "evil.example");
    const response = await POST(request);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["X-Request-ID"]).toBe(response.headers.get("x-request-id"));
    expect(Object.keys(headers).map((h) => h.toLowerCase()).sort()).toEqual(["accept", "content-type", "x-request-id"]);
  });

  it("returns the sanitized 500 and logs only the variable name for a bad APP_ORIGIN", async () => {
    vi.stubEnv("APP_ORIGIN", "http://app.example");
    const response = await call({ origin: "http://app.example", body: VALID });
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    const logged = vi.mocked(console.error).mock.calls.join("\n");
    expect(logged).toMatch(/APP_ORIGIN/);
    expect(logged).not.toMatch(/app\.example/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
