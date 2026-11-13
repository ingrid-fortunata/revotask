import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "./apiClient";
import { ApiError } from "./errors";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("apiPost", () => {
  it("posts JSON to a relative path with same-origin credentials and no cache, and unwraps data", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { user: { id: "1" } } }));
    const data = await apiPost<{ user: { id: string } }>("/api/auth/login", { email: "a", password: "b" });
    expect(data).toEqual({ user: { id: "1" } });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ email: "a", password: "b" });
  });

  it("sends no body or content type for logout and returns null data", async () => {
    fetchMock.mockResolvedValue(json(200, { data: null }));
    expect(await apiPost("/api/auth/logout")).toBeNull();
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty("Content-Type");
  });

  it("throws an ApiError built from the error envelope, with fields and Retry-After", async () => {
    fetchMock.mockResolvedValue(
      json(
        429,
        { error: { code: "RATE_LIMITED", message: "Too many requests.", request_id: "r-1" } },
        { "Retry-After": "30" },
      ),
    );
    const error = await apiPost<never>("/api/auth/login", {}).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: 429, code: "RATE_LIMITED", requestId: "r-1", retryAfterSeconds: 30 });
  });

  it("maps a network failure to a null-status ApiError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await apiPost<never>("/api/auth/login", {}).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBeNull();
    expect(error.message).not.toMatch(/Failed to fetch/);
  });

  it("rethrows an abort unchanged", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValue(abort);
    await expect(apiPost("/api/auth/login", {})).rejects.toBe(abort);
  });

  it.each([
    ["HTML on an error status", new Response("<html>502</html>", { status: 502 })],
    ["an empty error body", new Response("", { status: 500 })],
    ["a 200 without data", json(200, { ok: true })],
    ["a 200 that is not JSON", new Response("hello", { status: 200 })],
  ])("throws a retryable ApiError for %s", async (_label, response) => {
    fetchMock.mockResolvedValue(response);
    const error = await apiPost<never>("/api/auth/login", {}).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("refuses a path that is not declared", async () => {
    await expect(apiPost("/api/boards" as never, {})).rejects.toThrow(/not declared/);
    await expect(apiPost("https://evil.example/api/auth/login" as never, {})).rejects.toThrow(/not declared/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
