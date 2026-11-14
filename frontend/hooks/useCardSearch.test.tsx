import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/lib/apiClient";
import { cardSearchPath, SEARCH_DEBOUNCE_MS } from "@/lib/cardSearch";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { useCardSearch } from "./useCardSearch";

// Feature: my-tasks-search, Properties 9 and 10 (debounce, latest response wins) and the failure
// table of design "Hook". Fake timers drive the 300 ms debounce.

vi.mock("@/lib/apiClient", () => ({ apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

const BOARD = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const onAccessLost = vi.fn();

const result = (id: string, title = `Card ${id}`) => ({ id, title, column_id: "col" });
const apiError = (statusCode: number | null, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ statusCode, code, message: `m ${code}`, ...extra });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const calls = () => vi.mocked(apiGet).mock.calls;
const type = (hook: ReturnType<typeof setup>, text: string) => act(() => hook.result.current.setQuery(text));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function setup() {
  return renderHook(() => useCardSearch({ boardId: BOARD, onAccessLost }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiGet).mockResolvedValue([result("a")]);
  onAccessLost.mockReset();
  vi.mocked(hardRedirect).mockReset();
});
afterEach(() => vi.useRealTimers());

describe("debounce (property 10)", () => {
  it("starts idle with no request", () => {
    const hook = setup();
    expect(hook.result.current).toMatchObject({ query: "", status: "idle", held: null });
    expect(calls()).toHaveLength(0);
  });

  it("sends nothing before 300 ms and one request after, for the final text of a burst", async () => {
    const hook = setup();
    for (const text of ["c", "ca", "car", "card"]) {
      type(hook, text);
      await advance(100);
    }
    expect(calls()).toHaveLength(0);
    await advance(SEARCH_DEBOUNCE_MS - 100);
    expect(calls()).toHaveLength(1);
    expect(calls()[0][0]).toBe(cardSearchPath(BOARD, "card"));
    expect(hook.result.current.status).toBe("ready");
    expect(hook.result.current.held).toEqual({ query: "card", items: [result("a")] });
  });

  it("sends the trimmed text and keeps the field text as typed", async () => {
    const hook = setup();
    type(hook, "  card  ");
    await advance(300);
    expect(calls()[0][0]).toBe(cardSearchPath(BOARD, "card"));
    expect(hook.result.current.query).toBe("  card  ");
  });

  it("encodes the query in the path", async () => {
    const hook = setup();
    type(hook, "a&b 50%");
    await advance(300);
    expect(calls()[0][0]).toBe(`/api/boards/${BOARD}/cards/search?q=a%26b%2050%25`);
  });

  it("shows loading from the first change, through the debounce and the request", async () => {
    const pending = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValue(pending.promise);
    const hook = setup();
    type(hook, "card");
    expect(hook.result.current.status).toBe("loading");
    await advance(299);
    expect(hook.result.current.status).toBe("loading");
    await advance(1);
    expect(hook.result.current.status).toBe("loading");
    await act(async () => pending.resolve([result("a")]));
    expect(hook.result.current.status).toBe("ready");
  });
});

describe("blank and unchanged text", () => {
  it("clears results and loading at once for a blank value and sends nothing", async () => {
    const hook = setup();
    type(hook, "card");
    await advance(300);
    expect(hook.result.current.held).not.toBeNull();
    type(hook, "   ");
    expect(hook.result.current).toMatchObject({ status: "idle", held: null, fieldError: null });
    await advance(1000);
    expect(calls()).toHaveLength(1);
  });

  it("cancels a running debounce timer when the field is cleared", async () => {
    const hook = setup();
    type(hook, "card");
    await advance(200);
    type(hook, "");
    expect(hook.result.current.status).toBe("idle");
    await advance(1000);
    expect(calls()).toHaveLength(0);
  });

  it("aborts a pending request and ignores its response when the field is cleared", async () => {
    const pending = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValue(pending.promise);
    const hook = setup();
    type(hook, "card");
    await advance(300);
    const signal = calls()[0][1] as AbortSignal;
    type(hook, "");
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve([result("a")]));
    expect(hook.result.current).toMatchObject({ status: "idle", held: null });
  });

  it("sends nothing and clears nothing when only the whitespace changes", async () => {
    const hook = setup();
    type(hook, "card");
    await advance(300);
    type(hook, "card ");
    type(hook, " card");
    expect(hook.result.current.status).toBe("ready");
    expect(hook.result.current.held?.query).toBe("card");
    await advance(1000);
    expect(calls()).toHaveLength(1);
  });

  it("clears the previous results as soon as the normalized query changes (Q3)", async () => {
    const hook = setup();
    type(hook, "card");
    await advance(300);
    expect(hook.result.current.held?.items).toHaveLength(1);
    type(hook, "cards");
    expect(hook.result.current).toMatchObject({ status: "loading", held: null });
  });
});

describe("latest response wins (property 9)", () => {
  it("drops a late response of an earlier query and aborts the earlier request", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = setup();
    type(hook, "one");
    await advance(300);
    const firstSignal = calls()[0][1] as AbortSignal;
    type(hook, "two");
    expect(firstSignal.aborted).toBe(true); // a changed query aborts the earlier request at once
    await advance(300);
    await act(async () => second.resolve([result("two")]));
    await act(async () => first.resolve([result("one")]));
    expect(hook.result.current.held).toEqual({ query: "two", items: [result("two")] });
    expect(hook.result.current.status).toBe("ready");
  });

  it("handles the opposite completion order the same way", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = setup();
    type(hook, "one");
    await advance(300);
    type(hook, "two");
    await advance(300);
    await act(async () => first.resolve([result("one")]));
    expect(hook.result.current.status).toBe("loading");
    await act(async () => second.resolve([result("two")]));
    expect(hook.result.current.held?.query).toBe("two");
  });

  it("does not show an abort as an error and a late error of an earlier query is dropped", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = setup();
    type(hook, "one");
    await advance(300);
    type(hook, "two");
    await advance(300);
    await act(async () => first.reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    expect(hook.result.current.status).toBe("loading");
    await act(async () => second.resolve([result("two")]));
    await act(async () => first.reject(apiError(500, "INTERNAL_ERROR")));
    expect(hook.result.current.status).toBe("ready");
  });
});

describe("failures", () => {
  it.each([
    ["a 5xx", () => apiError(500, "INTERNAL_ERROR")],
    ["a 503", () => apiError(503, "SERVICE_UNAVAILABLE")],
    ["a transport failure", () => apiError(null, "SERVICE_UNAVAILABLE")],
  ])("%s gives the error state, keeps the text and allows Retry", async (_label, make) => {
    vi.mocked(apiGet).mockRejectedValueOnce(make());
    const hook = setup();
    type(hook, "card");
    await advance(300);
    expect(hook.result.current).toMatchObject({ status: "error", held: null, fieldError: null, query: "card" });
    expect(onAccessLost).not.toHaveBeenCalled();
    await act(async () => hook.result.current.retry());
    expect(calls()).toHaveLength(2); // sent at once, with no debounce
    expect(hook.result.current.status).toBe("ready");
  });

  it("typing the same text again after an error sends a new request", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(500, "INTERNAL_ERROR"));
    const hook = setup();
    type(hook, "card");
    await advance(300);
    type(hook, "card ");
    await advance(300);
    expect(calls()).toHaveLength(2);
    expect(hook.result.current.status).toBe("ready");
  });

  it("shows the field message of a 400 and does not retry", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(400, "VALIDATION_ERROR", { fields: { q: "Enter valid text." } }));
    const hook = setup();
    type(hook, "card");
    await advance(300);
    expect(hook.result.current).toMatchObject({ status: "error", fieldError: "Enter valid text." });
    await advance(5000);
    expect(calls()).toHaveLength(1);
  });

  it("calls onAccessLost for a 404 (the generic NOT_FOUND)", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(404, "NOT_FOUND"));
    const hook = setup();
    type(hook, "card");
    await advance(300);
    expect(onAccessLost).toHaveBeenCalledTimes(1);
  });

  it("hands a 401 to the error handler, which redirects to login", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(401, "AUTH_REQUIRED"));
    const hook = setup();
    type(hook, "card");
    await advance(300);
    expect(hardRedirect).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(hardRedirect).mock.calls[0][0])).toMatch(/^\/login/);
    expect(onAccessLost).not.toHaveBeenCalled();
  });

  it("treats a malformed response as an error", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ not: "a list" });
    const hook = setup();
    type(hook, "card");
    await advance(300);
    expect(hook.result.current.status).toBe("error");
  });
});

describe("unmount", () => {
  it("clears the timer", async () => {
    const hook = setup();
    type(hook, "card");
    await advance(100);
    hook.unmount();
    await advance(1000);
    expect(calls()).toHaveLength(0);
  });

  it("aborts the request in flight and ignores its response", async () => {
    const pending = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValue(pending.promise);
    const hook = setup();
    type(hook, "card");
    await advance(300);
    const signal = calls()[0][1] as AbortSignal;
    hook.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve([result("a")]));
    expect(onAccessLost).not.toHaveBeenCalled();
  });
});
