import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { notificationReadPath, notificationsPath, POLL_INTERVAL_MS } from "@/lib/notifications";
import { notifyError } from "@/lib/toast";
import type { NotificationItem, NotificationPage } from "@/lib/types";
import { NOTIFICATION_MESSAGES, useNotifications } from "./useNotifications";

// Feature: notifications, Properties 11 to 13 (design "useNotifications"). Fake timers drive the
// 30-second poll. The API client is mocked, so each test controls when a response arrives.

vi.mock("@/lib/apiClient", () => ({ apiGet: vi.fn(), apiRequest: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

const note = (id: string, readAt: string | null = null): NotificationItem => ({
  id,
  kind: "assigned",
  board_id: "board-1",
  card_id: "card-1",
  actor_id: "actor-1",
  actor_name: "Ana",
  board_name: "Launch",
  card_title: `Card ${id}`,
  created_at: "2026-11-14T02:00:00+00:00",
  read_at: readAt,
});

const pageData = (items: NotificationItem[], extra: Partial<NotificationPage> = {}): NotificationPage => ({
  items,
  page: 1,
  per_page: 20,
  total: items.length,
  unread_count: items.filter((item) => item.read_at === null).length,
  ...extra,
});

const apiError = (statusCode: number | null, code: string) => new ApiError({ statusCode, code, message: `m ${code}` });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const gets = () => vi.mocked(apiGet).mock.calls;
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const flush = () => advance(0);

async function setup(first: NotificationPage = pageData([note("a"), note("b")])) {
  vi.mocked(apiGet).mockResolvedValue(first);
  const hook = renderHook(() => useNotifications());
  await flush();
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(notifyError).mockReset();
  vi.mocked(hardRedirect).mockReset();
});
afterEach(() => vi.useRealTimers());

describe("mount and poll (Requirements 8.1, 8.2; Property 12)", () => {
  it("shows no count before the first response, then the unread count", async () => {
    const first = deferred<NotificationPage>();
    vi.mocked(apiGet).mockReturnValue(first.promise);
    const hook = renderHook(() => useNotifications());
    expect(hook.result.current.unread).toBeNull();
    expect(gets()).toHaveLength(1);
    expect(gets()[0][0]).toBe(notificationsPath(1));
    first.resolve(pageData([note("a"), note("b")], { unread_count: 7, total: 7 }));
    await flush();
    expect(hook.result.current.unread).toBe(7);
  });

  it("sends one Poll every 30 seconds", async () => {
    await setup();
    expect(gets()).toHaveLength(1);
    await advance(POLL_INTERVAL_MS - 1);
    expect(gets()).toHaveLength(1);
    await advance(1);
    expect(gets()).toHaveLength(2);
    await advance(POLL_INTERVAL_MS);
    expect(gets()).toHaveLength(3);
  });

  it("skips a tick while a request is still in flight and never sends two at once", async () => {
    const first = deferred<NotificationPage>();
    vi.mocked(apiGet).mockReturnValue(first.promise);
    renderHook(() => useNotifications());
    await advance(POLL_INTERVAL_MS * 2);
    expect(gets()).toHaveLength(1);
    first.resolve(pageData([note("a")]));
    await flush();
    await advance(POLL_INTERVAL_MS);
    expect(gets()).toHaveLength(2);
  });

  it("restarts the 30-second clock with every request, including a refresh", async () => {
    const hook = await setup();
    await advance(20_000);
    vi.mocked(apiRequest).mockResolvedValue(note("a", "2026-11-14T03:00:00+00:00"));
    await act(async () => {
      await hook.result.current.markRead("a");
    });
    await flush();
    expect(gets()).toHaveLength(2); // the refresh
    await advance(POLL_INTERVAL_MS - 1);
    expect(gets()).toHaveLength(2);
    await advance(1);
    expect(gets()).toHaveLength(3);
  });
});

describe("failures (Requirements 7.8, 8.6)", () => {
  it("keeps the list and count and shows nothing when a Poll fails, then polls again", async () => {
    const hook = await setup();
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(500, "INTERNAL_ERROR"));
    await advance(POLL_INTERVAL_MS);
    expect(hook.result.current.status).toBe("ready");
    expect(hook.result.current.unread).toBe(2);
    expect(hook.result.current.items).toHaveLength(2);
    expect(notifyError).not.toHaveBeenCalled();
    await advance(POLL_INTERVAL_MS);
    expect(gets()).toHaveLength(3);
  });

  it("sets the error state and keeps the rows when a foreground request fails", async () => {
    const hook = await setup();
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(null, "SERVICE_UNAVAILABLE"));
    act(() => hook.result.current.open());
    expect(hook.result.current.status).toBe("loading");
    await flush();
    expect(hook.result.current.status).toBe("error");
    expect(hook.result.current.items).toHaveLength(2);
    vi.mocked(apiGet).mockResolvedValueOnce(pageData([note("a")]));
    act(() => hook.result.current.retry());
    await flush();
    expect(hook.result.current.status).toBe("ready");
    expect(hook.result.current.items).toHaveLength(1);
  });

  it("handles a 401 once and stops polling", async () => {
    vi.mocked(apiGet).mockRejectedValue(apiError(401, "AUTH_REQUIRED"));
    renderHook(() => useNotifications());
    await flush();
    expect(hardRedirect).toHaveBeenCalledTimes(1);
    await advance(POLL_INTERVAL_MS * 3);
    expect(gets()).toHaveLength(1);
    expect(hardRedirect).toHaveBeenCalledTimes(1);
  });
});

describe("unmount (Requirement 8.4; Property 13)", () => {
  it("aborts the request, clears the timer and ignores a late response", async () => {
    const first = deferred<NotificationPage>();
    vi.mocked(apiGet).mockReturnValue(first.promise);
    const hook = renderHook(() => useNotifications());
    const signal = gets()[0][1] as AbortSignal;
    hook.unmount();
    expect(signal.aborted).toBe(true);
    first.resolve(pageData([note("a")]));
    await flush();
    await advance(POLL_INTERVAL_MS * 3);
    expect(gets()).toHaveLength(1);
    expect(notifyError).not.toHaveBeenCalled();
  });
});

describe("panel and paging (Requirements 7.7, 7.9, 7.12, 8.5)", () => {
  it("open() shows loading and then page 1", async () => {
    const hook = await setup();
    const reopened = deferred<NotificationPage>();
    vi.mocked(apiGet).mockReturnValueOnce(reopened.promise);
    act(() => hook.result.current.open());
    expect(hook.result.current.status).toBe("loading");
    expect(gets().at(-1)![0]).toBe(notificationsPath(1));
    reopened.resolve(pageData([note("z")]));
    await flush();
    expect(hook.result.current.status).toBe("ready");
    expect(hook.result.current.items.map((item) => item.id)).toEqual(["z"]);
  });

  it("drops a response for an earlier page", async () => {
    const hook = await setup();
    const one = deferred<NotificationPage>();
    const two = deferred<NotificationPage>();
    vi.mocked(apiGet).mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise);
    act(() => hook.result.current.open());
    act(() => hook.result.current.goToPage(2));
    one.resolve(pageData([note("page-one")], { total: 25 }));
    await flush();
    expect(hook.result.current.items.map((item) => item.id)).toEqual(["a", "b"]); // unchanged
    expect(hook.result.current.status).toBe("loading");
    two.resolve(pageData([note("page-two")], { total: 25, page: 2 }));
    await flush();
    expect(hook.result.current.items.map((item) => item.id)).toEqual(["page-two"]);
    expect(hook.result.current.page).toBe(2);
    expect(hook.result.current.pageCount).toBe(2);
  });

  it("close() sends the next Poll for page 1", async () => {
    const hook = await setup(pageData([note("a")], { total: 45 }));
    vi.mocked(apiGet).mockResolvedValue(pageData([note("c")], { total: 45, page: 3 }));
    act(() => hook.result.current.goToPage(3));
    await flush();
    expect(hook.result.current.page).toBe(3);
    act(() => hook.result.current.close());
    expect(hook.result.current.page).toBe(1);
    vi.mocked(apiGet).mockResolvedValue(pageData([note("a")], { total: 45 }));
    await advance(POLL_INTERVAL_MS);
    expect(gets().at(-1)![0]).toBe(notificationsPath(1));
  });

  it("moves to the last page that exists when the shown page empties", async () => {
    const hook = await setup(pageData([note("a")], { total: 45 }));
    vi.mocked(apiGet)
      .mockResolvedValueOnce(pageData([], { total: 25, page: 3 }))
      .mockResolvedValueOnce(pageData([note("x")], { total: 25, page: 2 }));
    act(() => hook.result.current.goToPage(3));
    await flush();
    expect(gets().at(-1)![0]).toBe(notificationsPath(2));
    expect(hook.result.current.page).toBe(2);
    expect(hook.result.current.items.map((item) => item.id)).toEqual(["x"]);
  });
});

describe("mark as read (Requirements 7.5, 7.8, 8.3, 8.5; Properties 11 and 12)", () => {
  it("marks the row, lowers the count at once and refreshes the page", async () => {
    const hook = await setup(pageData([note("a"), note("b")]));
    const saved = note("a", "2026-11-14T03:00:00+00:00");
    vi.mocked(apiRequest).mockResolvedValue(saved);
    const refresh = deferred<NotificationPage>();
    vi.mocked(apiGet).mockReturnValueOnce(refresh.promise);
    await act(async () => {
      await hook.result.current.markRead("a");
    });
    expect(apiRequest).toHaveBeenCalledWith("PATCH", notificationReadPath("a"));
    expect(hook.result.current.items[0].read_at).toBe(saved.read_at);
    expect(hook.result.current.unread).toBe(1); // lowered before the refresh lands
    expect(hook.result.current.announcement).toBe(NOTIFICATION_MESSAGES.marked);
    expect(hook.result.current.markingId).toBeNull();
    refresh.resolve(pageData([saved, note("b")]));
    await flush();
    expect(hook.result.current.unread).toBe(1);
  });

  it("skips a tick while a mark is pending", async () => {
    const hook = await setup();
    const pending = deferred<NotificationItem>();
    vi.mocked(apiRequest).mockReturnValue(pending.promise);
    let done!: Promise<void>;
    act(() => {
      done = hook.result.current.markRead("a");
    });
    expect(hook.result.current.markingId).toBe("a");
    await advance(POLL_INTERVAL_MS * 2);
    expect(gets()).toHaveLength(1); // no Poll while the mark is pending
    pending.resolve(note("a", "2026-11-14T03:00:00+00:00"));
    await act(async () => {
      await done;
    });
    expect(gets()).toHaveLength(2); // the one refresh
  });

  it("aborts a Poll that is in flight, drops its response and sends one refresh (Property 11)", async () => {
    const hook = await setup(pageData([note("a"), note("b")]));
    const poll = deferred<NotificationPage>();
    vi.mocked(apiGet).mockReturnValueOnce(poll.promise);
    await advance(POLL_INTERVAL_MS);
    expect(gets()).toHaveLength(2);
    const pollSignal = gets()[1][1] as AbortSignal;

    vi.mocked(apiRequest).mockResolvedValue(note("a", "2026-11-14T03:00:00+00:00"));
    const refresh = deferred<NotificationPage>();
    vi.mocked(apiGet).mockReturnValueOnce(refresh.promise);
    await act(async () => {
      await hook.result.current.markRead("a");
    });
    expect(pollSignal.aborted).toBe(true);
    expect(gets()).toHaveLength(3); // exactly one refresh
    // The old Poll answers late with the count from before the mark. It must not win.
    poll.resolve(pageData([note("a"), note("b")], { unread_count: 2 }));
    await flush();
    expect(hook.result.current.unread).toBe(1);
    refresh.resolve(pageData([note("a", "2026-11-14T03:00:00+00:00"), note("b")], { unread_count: 1 }));
    await flush();
    expect(hook.result.current.unread).toBe(1);
  });

  it("refreshes the list when the notification is hidden or gone (404)", async () => {
    const hook = await setup();
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    await act(async () => {
      await hook.result.current.markRead("a");
    });
    await flush();
    expect(gets()).toHaveLength(2);
    expect(notifyError).not.toHaveBeenCalled();
    expect(hook.result.current.announcement).toBe(NOTIFICATION_MESSAGES.gone);
  });

  it("keeps the row Unread, shows a row notice and a toast, and allows a retry after a failure", async () => {
    const hook = await setup();
    vi.mocked(apiRequest).mockRejectedValueOnce(apiError(500, "INTERNAL_ERROR"));
    await act(async () => {
      await hook.result.current.markRead("a");
    });
    expect(hook.result.current.items[0].read_at).toBeNull();
    expect(hook.result.current.unread).toBe(2);
    expect(hook.result.current.rowNotice).toEqual({ id: "a", text: NOTIFICATION_MESSAGES.markFailed });
    expect(hook.result.current.announcement).toBe(NOTIFICATION_MESSAGES.markFailed);
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(hook.result.current.markingId).toBeNull();
    const saved = note("a", "2026-11-14T03:00:00+00:00");
    vi.mocked(apiRequest).mockResolvedValueOnce(saved);
    vi.mocked(apiGet).mockResolvedValueOnce(pageData([saved, note("b")]));
    await act(async () => {
      await hook.result.current.markRead("a");
    });
    expect(hook.result.current.rowNotice).toBeNull();
    expect(hook.result.current.items[0].read_at).not.toBeNull();
  });

  it("swallows a failure for a quiet mark (a link click): no toast and no row notice", async () => {
    const hook = await setup();
    vi.mocked(apiRequest).mockRejectedValueOnce(apiError(null, "SERVICE_UNAVAILABLE"));
    await act(async () => {
      await hook.result.current.markRead("a", { quiet: true });
    });
    expect(notifyError).not.toHaveBeenCalled();
    expect(hook.result.current.rowNotice).toBeNull();
    expect(hook.result.current.items[0].read_at).toBeNull();
  });

  it("sends one mark at a time", async () => {
    const hook = await setup();
    const pending = deferred<NotificationItem>();
    vi.mocked(apiRequest).mockReturnValue(pending.promise);
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.markRead("a");
    });
    await act(async () => {
      await hook.result.current.markRead("b");
    });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    pending.resolve(note("a", "2026-11-14T03:00:00+00:00"));
    await act(async () => {
      await first;
    });
  });

  it("handles a 401 from a mark once and stops polling", async () => {
    const hook = await setup();
    vi.mocked(apiRequest).mockRejectedValue(apiError(401, "AUTH_REQUIRED"));
    await act(async () => {
      await hook.result.current.markRead("a");
    });
    expect(hardRedirect).toHaveBeenCalledTimes(1);
    await advance(POLL_INTERVAL_MS * 2);
    expect(gets()).toHaveLength(1);
  });
});
