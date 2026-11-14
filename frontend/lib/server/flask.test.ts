// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors";
import { FLASK_PATHS, flaskRequest, UPSTREAM_TIMEOUT_MS } from "./flask";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:5001");
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function reply(
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  return new Response(body, { status, headers });
}

describe("flaskRequest", () => {
  it("calls only the fixed origin and the path for the route key", async () => {
    fetchMock.mockResolvedValue(reply(200, '{"data":{"ok":true}}'));
    const result = await flaskRequest({
      route: "me",
      method: "GET",
      token: "tok",
      requestId: "r-1",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:5001" + FLASK_PATHS.me);
    expect(init.method).toBe("GET");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: { ok: true } });
    expect(result.requestId).toBe("r-1");
  });

  it("sets no-store, manual redirects, a timeout signal and the request id", async () => {
    fetchMock.mockResolvedValue(reply(200, "{}"));
    await flaskRequest({
      route: "login",
      method: "POST",
      body: { a: 1 },
      requestId: "r-2",
    });
    const init = fetchMock.mock.calls[0][1];
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(UPSTREAM_TIMEOUT_MS).toBe(10_000);
    expect(init.headers["X-Request-ID"]).toBe("r-2");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"a":1}');
  });

  it("sends a bearer only when a token is passed", async () => {
    fetchMock.mockResolvedValue(reply(200, "{}"));
    await flaskRequest({
      route: "me",
      method: "GET",
      token: "tok-123",
      requestId: "r-3",
    });
    await flaskRequest({
      route: "login",
      method: "POST",
      body: {},
      requestId: "r-4",
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer tok-123",
    );
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("rejects a route key that is not in FLASK_PATHS", async () => {
    await expect(
      flaskRequest({
        route: "https://evil.example/steal" as never,
        method: "GET",
        requestId: "r",
      }),
    ).rejects.toThrow(/unknown route/);
    await expect(
      flaskRequest({
        route: "toString" as never,
        method: "GET",
        requestId: "r",
      }),
    ).rejects.toThrow(/unknown route/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an error status with its body and Retry-After", async () => {
    fetchMock.mockResolvedValue(
      reply(429, '{"error":{"code":"RATE_LIMITED"}}', { "Retry-After": "30" }),
    );
    const result = await flaskRequest({
      route: "login",
      method: "POST",
      body: {},
      requestId: "r-5",
    });
    expect(result.status).toBe(429);
    expect(result.retryAfter).toBe("30");
  });

  it("returns a null body for HTML or an empty reply", async () => {
    fetchMock.mockResolvedValueOnce(reply(502, "<html>Bad gateway</html>"));
    fetchMock.mockResolvedValueOnce(reply(200, ""));
    expect(
      (await flaskRequest({ route: "me", method: "GET", requestId: "a" })).body,
    ).toBeNull();
    expect(
      (await flaskRequest({ route: "me", method: "GET", requestId: "b" })).body,
    ).toBeNull();
  });

  it.each([
    [
      "a rejected fetch",
      () => Promise.reject(new TypeError("fetch failed secret-host")),
    ],
    [
      "a timeout",
      () =>
        Promise.reject(
          Object.assign(new Error("timed out"), { name: "TimeoutError" }),
        ),
    ],
  ])(
    "throws a retryable ApiError with null status for %s",
    async (_label, make) => {
      fetchMock.mockImplementation(make);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const error = await flaskRequest({
        route: "me",
        method: "GET",
        requestId: "r-6",
      }).catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBeNull();
      expect(error.code).toBe("SERVICE_UNAVAILABLE");
      expect(error.message).not.toMatch(/secret-host/);
    },
  );

  it("treats an upstream redirect as a failure and does not follow it", async () => {
    fetchMock.mockResolvedValue(
      reply(302, "", { Location: "https://evil.example/" }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = await flaskRequest({
      route: "me",
      method: "GET",
      requestId: "r-7",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("logs the request id, route and outcome without the token, body or URL", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await flaskRequest({
      route: "login",
      method: "POST",
      body: { password: "pw-sentinel-123" },
      token: "token-sentinel-456",
      requestId: "r-8",
    }).catch(() => {});
    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("request_id=r-8");
    expect(logged).toContain("route=login");
    expect(logged).not.toMatch(/sentinel|127\.0\.0\.1|Bearer/);
  });

  it("fails with a configuration error that names the variable when the environment is bad", async () => {
    vi.stubEnv("API_BASE_URL", "");
    await expect(
      flaskRequest({ route: "me", method: "GET", requestId: "r-9" }),
    ).rejects.toThrow(/^API_BASE_URL: a value is required/);
  });
});

describe("flaskRequest UUID-only path substitution", () => {
  const BOARD_ID = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
  const MEMBER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  it("fills :boardId and :userId with UUIDs under the fixed origin", async () => {
    fetchMock.mockResolvedValue(reply(200, "{}"));
    await flaskRequest({
      route: "boardMember",
      method: "DELETE",
      params: { boardId: BOARD_ID, userId: MEMBER_ID },
      token: "tok",
      requestId: "u-1",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `http://127.0.0.1:5001/api/boards/${BOARD_ID}/members/${MEMBER_ID}`,
    );
  });

  it("accepts an upper-case UUID", async () => {
    fetchMock.mockResolvedValue(reply(200, "{}"));
    await flaskRequest({
      route: "board",
      method: "PATCH",
      params: { boardId: BOARD_ID.toUpperCase() },
      body: { name: "x" },
      requestId: "u-2",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `http://127.0.0.1:5001/api/boards/${BOARD_ID.toUpperCase()}`,
    );
  });

  it.each([
    [".."],
    ["../x"],
    ["a/b"],
    ["abc?x=1"],
    ["#frag"],
    ["%2e%2e"],
    [""],
    [`${BOARD_ID}/extra`],
    [`${BOARD_ID}?x=1`],
    [` ${BOARD_ID}`],
  ])("rejects the boardId value %j before any request", async (value) => {
    await expect(
      flaskRequest({
        route: "board",
        method: "DELETE",
        params: { boardId: value },
        requestId: "u-3",
      }),
    ).rejects.toThrow(/boardId must be a UUID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fills :notificationId with a UUID and rejects any other value before a request", async () => {
    fetchMock.mockResolvedValue(reply(200, "{}"));
    await flaskRequest({
      route: "notificationRead",
      method: "PATCH",
      params: { notificationId: MEMBER_ID },
      token: "tok",
      requestId: "u-n1",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `http://127.0.0.1:5001/api/notifications/${MEMBER_ID}/read`,
    );
    fetchMock.mockClear();
    for (const value of ["..", "a/b", "abc?x=1", "", `${MEMBER_ID}/extra`]) {
      await expect(
        flaskRequest({
          route: "notificationRead",
          method: "PATCH",
          params: { notificationId: value },
          requestId: "u-n2",
        }),
      ).rejects.toThrow(/notificationId must be a UUID/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing boardId", async () => {
    await expect(
      flaskRequest({ route: "board", method: "PATCH", requestId: "u-4" }),
    ).rejects.toThrow(/boardId must be a UUID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[".."], ["a/b"], ["abc?x=1"], [""]])(
    "rejects the userId value %j on a member route before any request",
    async (value) => {
      await expect(
        flaskRequest({
          route: "boardMember",
          method: "DELETE",
          params: { boardId: BOARD_ID, userId: value },
          requestId: "u-5",
        }),
      ).rejects.toThrow(/userId must be a UUID/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a bad boardId even when the userId is a valid UUID", async () => {
    await expect(
      flaskRequest({
        route: "boardMember",
        method: "DELETE",
        params: { boardId: "..", userId: MEMBER_ID },
        requestId: "u-6",
      }),
    ).rejects.toThrow(/boardId must be a UUID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("flaskRequest search option (S3)", () => {
  const call = (search: string | undefined) =>
    flaskRequest({ route: "myTasks", method: "GET", token: "tok", requestId: "r-1", search });

  it("sets the raw query string on the final URL, keeping repeats and unknown keys in order", async () => {
    fetchMock.mockResolvedValue(reply(200, '{"data":[]}'));
    await call("?q=a&q=b&foo=%00&assignee=me");
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://127.0.0.1:5001/api/cards?q=a&q=b&foo=%00&assignee=me");
  });

  it("adds nothing for no search or an empty search", async () => {
    fetchMock.mockResolvedValue(reply(200, '{"data":[]}'));
    await call(undefined);
    await call("");
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://127.0.0.1:5001/api/cards");
    expect(String(fetchMock.mock.calls[1][0])).toBe("http://127.0.0.1:5001/api/cards");
  });

  it.each(["assignee=me", "/x?y=1", "//evil.example/?x", "@evil.example"])("throws for %j without calling fetch", async (search) => {
    await expect(call(search)).rejects.toThrow(/search must be empty or start with/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cannot move the request to another path or host", async () => {
    fetchMock.mockResolvedValue(reply(200, '{"data":[]}'));
    await call("?next=/api/users/me#/evil");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin).toBe("http://127.0.0.1:5001");
    expect(url.pathname).toBe("/api/cards");
  });
});
