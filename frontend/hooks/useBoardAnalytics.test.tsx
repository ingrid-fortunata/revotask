import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import type { BoardAnalytics } from "@/lib/types";
import { ANALYTICS_ERROR_MESSAGE, useBoardAnalytics } from "./useBoardAnalytics";

// Feature: analytics, Properties 10 and 11 (latest read wins, a read only on a version rise) and
// the failure table of design "useBoardAnalytics". Requests are deferred so order is explicit.

vi.mock("@/lib/apiClient", () => ({ apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

const BOARD = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const onAccessLost = vi.fn();

const figures = (completed: number): BoardAnalytics => ({
  week_start: "2026-11-09T00:00:00Z",
  week_end: "2026-11-16T00:00:00Z",
  cards_per_column: [{ column_id: "c1", name: "To do", count: completed }],
  completed_cards: completed,
  member_activity: [],
});
const raw = (completed: number) => JSON.parse(JSON.stringify(figures(completed)));
const apiError = (statusCode: number | null, code: string) =>
  new ApiError({ statusCode, code, message: `m ${code}` });

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
const flush = () => act(async () => {});

function setup(initial: { boardId?: string; version?: number } = {}) {
  return renderHook(
    (props: { boardId: string; version: number }) => useBoardAnalytics({ ...props, onAccessLost }),
    { initialProps: { boardId: initial.boardId ?? BOARD, version: initial.version ?? 0 } },
  );
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiGet).mockResolvedValue(raw(1));
  onAccessLost.mockReset();
  vi.mocked(hardRedirect).mockReset();
});

describe("reads (property 11)", () => {
  it("reads once on mount, shows loading first and then the parsed figures", async () => {
    const hook = setup();
    expect(hook.result.current.status).toBe("loading");
    expect(hook.result.current.data).toBeNull();
    await flush();
    expect(calls()).toHaveLength(1);
    expect(calls()[0][0]).toBe(`/api/boards/${BOARD}/analytics`);
    expect(hook.result.current.status).toBe("ready");
    expect(hook.result.current.data).toEqual(figures(1));
    expect(hook.result.current.busy).toBe(false);
  });

  it("reads again when the version rises and not when it stays the same or falls", async () => {
    const hook = setup({ version: 3 });
    await flush();
    hook.rerender({ boardId: BOARD, version: 3 });
    hook.rerender({ boardId: BOARD, version: 2 });
    await flush();
    expect(calls()).toHaveLength(1);
    hook.rerender({ boardId: BOARD, version: 4 });
    await flush();
    expect(calls()).toHaveLength(2);
    hook.rerender({ boardId: BOARD, version: 4 });
    hook.rerender({ boardId: BOARD, version: 3 }); // a rolled-back move
    await flush();
    expect(calls()).toHaveLength(2);
  });

  it("aborts a read in flight when the version rises and starts one new read", async () => {
    const first = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(first.promise as never);
    const hook = setup({ version: 0 });
    hook.rerender({ boardId: BOARD, version: 1 });
    await flush();
    expect(calls()).toHaveLength(2);
    expect((calls()[0][1] as AbortSignal).aborted).toBe(true);
    first.resolve(raw(9)); // the aborted read answers late and is ignored
    await flush();
    expect(hook.result.current.data).toEqual(figures(1));
  });

  it("refresh reads again, keeps the held figures and marks the hook busy meanwhile", async () => {
    const hook = setup();
    await flush();
    const second = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(second.promise as never);
    act(() => {
      void hook.result.current.refresh();
    });
    expect(hook.result.current.busy).toBe(true);
    expect(hook.result.current.status).toBe("ready");
    expect(hook.result.current.data).toEqual(figures(1));
    second.resolve(raw(5));
    await flush();
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.data).toEqual(figures(5));
  });
});

describe("stale responses (property 10)", () => {
  it("an earlier slow response cannot overwrite a later one", async () => {
    const slow = deferred<unknown>();
    const fast = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(slow.promise as never).mockReturnValueOnce(fast.promise as never);
    const hook = setup();
    act(() => {
      void hook.result.current.refresh();
    });
    fast.resolve(raw(2));
    await flush();
    slow.resolve(raw(7));
    await flush();
    expect(hook.result.current.data).toEqual(figures(2));
  });

  it("a board change aborts, drops the figures and ignores the earlier board's response", async () => {
    const hook = setup();
    await flush();
    expect(hook.result.current.data).toEqual(figures(1));
    const late = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(late.promise as never);
    const slowOther = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(slowOther.promise as never);
    // Start a read for the first board that will answer late, then switch boards.
    act(() => {
      void hook.result.current.refresh();
    });
    hook.rerender({ boardId: OTHER, version: 0 });
    await flush();
    expect(hook.result.current.data).toBeNull(); // the first board's figures are gone
    expect(hook.result.current.status).toBe("loading");
    late.resolve(raw(8)); // the earlier board answers after the switch
    await flush();
    expect(hook.result.current.data).toBeNull();
    slowOther.resolve(raw(3));
    await flush();
    expect(hook.result.current.data).toEqual(figures(3));
    expect(calls().at(-1)?.[0]).toBe(`/api/boards/${OTHER}/analytics`);
  });

  it("unmount aborts the request and a late response changes nothing", async () => {
    const pending = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValueOnce(pending.promise as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const hook = setup();
    hook.unmount();
    expect((calls()[0][1] as AbortSignal).aborted).toBe(true);
    pending.resolve(raw(4));
    await flush();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("failures (design DD11)", () => {
  it("a 404 calls onAccessLost and shows no panel error", async () => {
    vi.mocked(apiGet).mockRejectedValue(apiError(404, "NOT_FOUND"));
    const hook = setup();
    await flush();
    expect(onAccessLost).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.busy).toBe(false);
  });

  it("a 401 goes through the shared handler (login redirect), not onAccessLost", async () => {
    vi.mocked(apiGet).mockRejectedValue(apiError(401, "AUTH_REQUIRED"));
    setup();
    await flush();
    expect(hardRedirect).toHaveBeenCalledTimes(1);
    expect(onAccessLost).not.toHaveBeenCalled();
  });

  it.each([
    ["a 5xx", () => apiError(503, "SERVICE_UNAVAILABLE")],
    ["a 400", () => apiError(400, "VALIDATION_ERROR")],
    ["a transport error", () => apiError(null, "NETWORK_ERROR")],
  ])("%s sets the error and keeps the last figures", async (_label, make) => {
    const hook = setup();
    await flush();
    vi.mocked(apiGet).mockRejectedValueOnce(make());
    await act(async () => {
      await hook.result.current.refresh();
    });
    expect(hook.result.current.error).toBe(ANALYTICS_ERROR_MESSAGE);
    expect(hook.result.current.data).toEqual(figures(1));
    expect(hook.result.current.busy).toBe(false);
    expect(onAccessLost).not.toHaveBeenCalled();
  });

  it("a malformed body is an error and never throws", async () => {
    vi.mocked(apiGet).mockResolvedValue({ week_start: "x" });
    const hook = setup();
    await flush();
    expect(hook.result.current.error).toBe(ANALYTICS_ERROR_MESSAGE);
    expect(hook.result.current.data).toBeNull();
    expect(hook.result.current.status).toBe("ready"); // the error is shown, not the loading text
  });

  it("a later good read clears the error", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(503, "SERVICE_UNAVAILABLE"));
    const hook = setup();
    await flush();
    expect(hook.result.current.error).toBe(ANALYTICS_ERROR_MESSAGE);
    await act(async () => {
      await hook.result.current.refresh();
    });
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.data).toEqual(figures(1));
  });
});
