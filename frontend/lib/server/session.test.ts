// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors";
import { API_BASE_URL, APP_ORIGIN, jsonReply } from "./testSupport";

const cookieGet = vi.fn();
class RedirectSignal extends Error {
  constructor(readonly path: string) {
    super(`redirect:${path}`);
  }
}
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new RedirectSignal(path);
  },
}));

const fetchMock = vi.fn();
const { fetchPrivate, getCurrentUser, getSessionToken } = await import("./session");

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", API_BASE_URL);
  vi.stubEnv("APP_ORIGIN", APP_ORIGIN);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  cookieGet.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const withCookie = (value: string | undefined) =>
  cookieGet.mockImplementation((name: string) => (name === "revotask_session" && value ? { value } : undefined));

describe("getSessionToken", () => {
  it("reads only the revotask_session cookie", async () => {
    withCookie("tok");
    expect(await getSessionToken()).toBe("tok");
    expect(cookieGet).toHaveBeenCalledWith("revotask_session");
  });
});

describe("fetchPrivate", () => {
  it("redirects to /login without calling Flask when there is no cookie", async () => {
    withCookie(undefined);
    await expect(fetchPrivate("me", { method: "GET" })).rejects.toMatchObject({ path: "/login" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the cookie's token as a bearer to the fixed Flask origin", async () => {
    withCookie("tok-sentinel");
    fetchMock.mockResolvedValue(jsonReply(200, { data: {} }));
    await fetchPrivate("me", { method: "GET" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE_URL}/api/users/me`);
    expect(init.headers.Authorization).toBe("Bearer tok-sentinel");
    expect(init.cache).toBe("no-store");
  });

  it("redirects to /login when Flask answers 401", async () => {
    withCookie("expired");
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "x" } }));
    await expect(fetchPrivate("me", { method: "GET" })).rejects.toMatchObject({ path: "/login" });
  });

  it("returns other statuses to the caller", async () => {
    withCookie("tok");
    fetchMock.mockResolvedValue(jsonReply(403, { error: { code: "FORBIDDEN", message: "x" } }));
    expect((await fetchPrivate("me", { method: "GET" })).status).toBe(403);
  });
});

describe("getCurrentUser", () => {
  it("returns only id, name and email", async () => {
    withCookie("tok");
    fetchMock.mockResolvedValue(
      jsonReply(200, { data: { id: "1", name: "Ada", email: "ada@example.com", password_hash: "x", access_token: "t" } }),
    );
    const user = await getCurrentUser();
    expect(user).toEqual({ id: "1", name: "Ada", email: "ada@example.com" });
  });

  it.each([
    ["Flask 503", () => jsonReply(503, { error: { code: "SERVICE_UNAVAILABLE", message: "down" } })],
    ["Flask 500", () => jsonReply(500, { error: { code: "INTERNAL_ERROR", message: "boom" } })],
    ["HTML 502", () => new Response("<html>bad gateway</html>", { status: 502 })],
    ["a 200 without data", () => jsonReply(200, { ok: true })],
    ["a 200 with a bad user", () => jsonReply(200, { data: { id: 1 } })],
    ["an unreachable Flask", () => Promise.reject(new TypeError("down"))],
  ])("throws an ApiError and does not redirect for %s", async (_label, make) => {
    withCookie("tok");
    fetchMock.mockImplementation(async () => make());
    const error = await getCurrentUser().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(RedirectSignal);
  });

  it("redirects for no cookie and for a 401", async () => {
    withCookie(undefined);
    await expect(getCurrentUser()).rejects.toMatchObject({ path: "/login" });
    withCookie("tok");
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: "AUTH_REQUIRED", message: "x" } }));
    await expect(getCurrentUser()).rejects.toMatchObject({ path: "/login" });
  });
});
