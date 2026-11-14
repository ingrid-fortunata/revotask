import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost, apiRequest, isDeclaredApiRequest } from "./apiClient";
import { ApiError } from "./errors";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

describe("apiPost", () => {
  it("posts JSON to a relative path with same-origin credentials and no cache, and unwraps data", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { user: { id: "1" } } }));
    const data = await apiPost<{ user: { id: string } }>("/api/auth/login", {
      email: "a",
      password: "b",
    });
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
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests.",
            request_id: "r-1",
          },
        },
        { "Retry-After": "30" },
      ),
    );
    const error = await apiPost<never>("/api/auth/login", {}).catch(
      (e: ApiError) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      statusCode: 429,
      code: "RATE_LIMITED",
      requestId: "r-1",
      retryAfterSeconds: 30,
    });
  });

  it("maps a network failure to a null-status ApiError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await apiPost<never>("/api/auth/login", {}).catch(
      (e: ApiError) => e,
    );
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
    [
      "HTML on an error status",
      new Response("<html>502</html>", { status: 502 }),
    ],
    ["an empty error body", new Response("", { status: 500 })],
    ["a 200 without data", json(200, { ok: true })],
    ["a 200 that is not JSON", new Response("hello", { status: 200 })],
  ])("throws a retryable ApiError for %s", async (_label, response) => {
    fetchMock.mockResolvedValue(response);
    const error = await apiPost<never>("/api/auth/login", {}).catch(
      (e: ApiError) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("refuses a path that is not declared", async () => {
    await expect(apiPost("/api/boards" as never, {})).rejects.toThrow(
      /not declared/,
    );
    await expect(
      apiPost("https://evil.example/api/auth/login" as never, {}),
    ).rejects.toThrow(/not declared/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
const BOARD_ID = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const MEMBER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("apiRequest allowlist", () => {
  it.each([
    ["PATCH", "/api/users/me"],
    ["POST", "/api/boards"],
    ["PATCH", `/api/boards/${BOARD_ID}`],
    ["DELETE", `/api/boards/${BOARD_ID}`],
    ["POST", `/api/boards/${BOARD_ID}/members`],
    ["DELETE", `/api/boards/${BOARD_ID}/members/${MEMBER_ID}`],
    ["DELETE", `/api/boards/${BOARD_ID.toUpperCase()}`],
  ] as const)("accepts the declared pair %s %s", (method, path) => {
    expect(isDeclaredApiRequest(method, path)).toBe(true);
  });

  it.each([
    ["GET", `/api/boards/${BOARD_ID}`],
    ["PATCH", "/api/boards"],
    ["POST", `/api/boards/${BOARD_ID}`],
    ["DELETE", `/api/boards/${BOARD_ID}/members`],
    ["PATCH", `/api/boards/${BOARD_ID}/members/${MEMBER_ID}`],
    ["DELETE", "/api/auth/logout"],
    ["PATCH", "/api/auth/login"],
    ["DELETE", `/api/boards/${BOARD_ID}/members/not-a-uuid`],
    ["DELETE", `/api/boards/${BOARD_ID}/../${MEMBER_ID}`],
    ["DELETE", `/api/boards/${BOARD_ID}?x=1`],
    ["PATCH", `https://evil.example/api/boards/${BOARD_ID}`],
    ["POST", `/api/boards/${BOARD_ID}/members/`],
    ["GET", "/api/users/me"],
    ["POST", "/api/users/me"],
    ["DELETE", "/api/users/me"],
    ["PATCH", "/api/users"],
    ["PATCH", "/api/users/me/"],
    ["PATCH", "/api/users/me/password"],
    ["PATCH", `/api/users/${MEMBER_ID}`],
    ["PATCH", "/api/users/me?x=1"],
  ] as const)("refuses the undeclared pair %s %s", (method, path) => {
    expect(isDeclaredApiRequest(method as never, path)).toBe(false);
  });

  it("refuses a non-string path", () => {
    expect(isDeclaredApiRequest("POST", undefined as never)).toBe(false);
    expect(isDeclaredApiRequest("POST", null as never)).toBe(false);
    expect(isDeclaredApiRequest("POST", 5 as never)).toBe(false);
  });

  it.each([
    ["GET", `/api/boards/${BOARD_ID}`],
    ["PATCH", "/api/boards"],
    ["POST", `/api/boards/${BOARD_ID}`],
    ["DELETE", `/api/boards/${BOARD_ID}/members`],
    ["DELETE", "/api/auth/logout"],
    ["DELETE", `/api/boards/${BOARD_ID}/../${MEMBER_ID}`],
    ["PATCH", "https://evil.example/api/boards"],
  ] as const)(
    "throws before fetch for the undeclared pair %s %s",
    async (method, path) => {
      await expect(apiRequest(method as never, path)).rejects.toThrow(
        /not declared/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("apiRequest requests", () => {
  it("sends a declared PATCH with a JSON body, same-origin credentials and no cache", async () => {
    fetchMock.mockResolvedValue(
      json(200, { data: { id: BOARD_ID, name: "Roadmap" } }),
    );
    const data = await apiRequest<{ id: string; name: string }>(
      "PATCH",
      `/api/boards/${BOARD_ID}`,
      {
        name: "Roadmap",
      },
    );
    expect(data).toEqual({ id: BOARD_ID, name: "Roadmap" });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe(`/api/boards/${BOARD_ID}`);
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ name: "Roadmap" });
  });

  it("unwraps a DELETE reply of { data: null } to null and sends no body", async () => {
    fetchMock.mockResolvedValue(json(200, { data: null }));
    expect(
      await apiRequest(
        "DELETE",
        `/api/boards/${BOARD_ID}/members/${MEMBER_ID}`,
      ),
    ).toBeNull();
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty("Content-Type");
  });

  it("maps USER_NOT_FOUND from an E11 reply with no fields", async () => {
    fetchMock.mockResolvedValue(
      json(404, {
        error: {
          code: "USER_NOT_FOUND",
          message: "No registered user has this email.",
        },
      }),
    );
    const error = await apiRequest<never>(
      "POST",
      `/api/boards/${BOARD_ID}/members`,
      {
        email: "x@example.com",
      },
    ).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
      message: "No registered user has this email.",
    });
    expect(error.fields).toBeUndefined();
  });

  it("keeps the server message for NOT_FOUND and uses fixed copy for STATE_CONFLICT with no message", async () => {
    fetchMock.mockResolvedValueOnce(
      json(404, { error: { code: "NOT_FOUND", message: "Board not found." } }),
    );
    fetchMock.mockResolvedValueOnce(
      json(409, { error: { code: "STATE_CONFLICT", message: "" } }),
    );
    const notFound = await apiRequest("PATCH", `/api/boards/${BOARD_ID}`, {
      name: "x",
    }).catch((e: ApiError) => e);
    const conflict = await apiRequest(
      "POST",
      `/api/boards/${BOARD_ID}/members`,
      { email: "a@example.com" },
    ).catch((e: ApiError) => e);
    expect(notFound).toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Board not found.",
    });
    expect(conflict).toMatchObject({
      statusCode: 409,
      code: "STATE_CONFLICT",
      message: "That change conflicts with the current state.",
    });
  });

  it("passes Retry-After seconds from a 429 reply", async () => {
    fetchMock.mockResolvedValue(
      json(
        429,
        { error: { code: "RATE_LIMITED", message: "Too many requests." } },
        { "Retry-After": "12" },
      ),
    );
    const error = await apiRequest(
      "POST",
      `/api/boards/${BOARD_ID}/members`,
      {},
    ).catch((e: ApiError) => e);
    expect(error).toMatchObject({
      statusCode: 429,
      code: "RATE_LIMITED",
      retryAfterSeconds: 12,
    });
  });

  it("maps a 200 reply without data to a retryable error", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    const error = await apiRequest<never>(
      "DELETE",
      `/api/boards/${BOARD_ID}`,
    ).catch((e: ApiError) => e);
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("maps a network failure to a null-status error and rethrows an abort unchanged", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const network = await apiRequest<never>(
      "DELETE",
      `/api/boards/${BOARD_ID}`,
    ).catch((e: ApiError) => e);
    expect(network).toBeInstanceOf(ApiError);
    expect(network.statusCode).toBeNull();

    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValueOnce(abort);
    await expect(apiRequest("DELETE", `/api/boards/${BOARD_ID}`)).rejects.toBe(
      abort,
    );
  });
});
