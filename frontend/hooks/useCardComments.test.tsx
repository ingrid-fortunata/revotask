import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { hardRedirect } from "@/lib/navigation";
import { notifyError } from "@/lib/toast";
import type { Comment } from "@/lib/types";
import { useCardComments, type NotFoundResolution } from "./useCardComments";

// Feature: comments, Properties 13, 17 and 19, and the failure table of design "Failure handling".

vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn(), apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

const CARD = "card-1";

function comment(id: string, over: Partial<Comment> = {}): Comment {
  return {
    id,
    card_id: CARD,
    author_id: "u-mia",
    author_name: "Mia",
    content: `Comment ${id}`,
    created_at: "2026-11-13T09:00:00+00:00",
    updated_at: "2026-11-13T09:00:00+00:00",
    ...over,
  };
}
const wire = (c: Comment) => ({ ...c });

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

const resolveNotFound = vi.fn<() => Promise<NotFoundResolution>>();
const onCardGone = vi.fn();

function setup(initial: Comment[] = [comment("c1"), comment("c2")]) {
  vi.mocked(apiGet).mockResolvedValue(initial.map(wire));
  return renderHook(() => useCardComments({ cardId: CARD, resolveNotFound, onCardGone }));
}

async function ready(initial?: Comment[]) {
  const hook = setup(initial);
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

const ids = (list: Comment[]) => list.map((c) => c.id);
const posts = () => vi.mocked(apiRequest).mock.calls.filter(([method]) => method === "POST");

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiGet).mockReset();
  vi.mocked(notifyError).mockReset();
  vi.mocked(hardRedirect).mockReset();
  resolveNotFound.mockReset();
  onCardGone.mockReset();
});

describe("loading", () => {
  it("reads E23 when mounted and shows the list in the server's order", async () => {
    const { result } = setup();
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current.comments)).toEqual(["c1", "c2"]);
    expect(apiGet).toHaveBeenCalledWith(`/api/cards/${CARD}/comments`, expect.any(AbortSignal));
  });

  it("shows the error state for a 5xx and Retry loads the list", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(503, "SERVICE_UNAVAILABLE"));
    const { result } = renderHook(() => useCardComments({ cardId: CARD, resolveNotFound, onCardGone }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    vi.mocked(apiGet).mockResolvedValue([wire(comment("c1"))]);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.status).toBe("ready");
    expect(ids(result.current.comments)).toEqual(["c1"]);
  });

  it("treats a malformed list as a load failure", async () => {
    vi.mocked(apiGet).mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => useCardComments({ cardId: CARD, resolveNotFound, onCardGone }));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});

describe("writes", () => {
  it("adds a comment at the end of the list and announces it", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockResolvedValue(wire(comment("c3", { content: "New" })));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.add("New");
    });
    expect(outcome).toEqual({ ok: true });
    expect(apiRequest).toHaveBeenCalledWith("POST", `/api/cards/${CARD}/comments`, { content: "New" });
    expect(ids(result.current.comments)).toEqual(["c1", "c2", "c3"]);
    expect(result.current.announcement).toBe("Comment added.");
    expect(result.current.pending).toBe(false);
  });

  it("replaces an edited comment by ID", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockResolvedValue(wire(comment("c1", { content: "Edited", updated_at: "2026-11-13T10:00:00+00:00" })));
    await act(async () => {
      await result.current.edit("c1", "Edited");
    });
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/comments/c1", { content: "Edited" });
    expect(result.current.comments[0].content).toBe("Edited");
    expect(ids(result.current.comments)).toEqual(["c1", "c2"]);
    expect(result.current.announcement).toBe("Comment saved.");
  });

  it("removes a deleted comment", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockResolvedValue(wire(comment("c1")));
    await act(async () => {
      await result.current.remove("c1");
    });
    expect(apiRequest).toHaveBeenCalledWith("DELETE", "/api/comments/c1");
    expect(ids(result.current.comments)).toEqual(["c2"]);
    expect(result.current.announcement).toBe("Comment deleted.");
  });

  it("runs one write at a time", async () => {
    const { result } = await ready();
    const reply = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValue(reply.promise);
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.add("one");
    });
    expect(result.current.pending).toBe(true);
    let second: unknown;
    await act(async () => {
      second = await result.current.add("two");
    });
    expect(second).toEqual({ ok: false, handled: true });
    expect(await Promise.resolve(vi.mocked(apiRequest).mock.calls.length)).toBe(1);
    await act(async () => {
      reply.resolve(wire(comment("c3")));
      await first;
    });
    expect(result.current.pending).toBe(false);
  });

  it("returns the field errors of a 400 and leaves the list alone", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(
      apiError(400, "VALIDATION_ERROR", { fields: { content: "Must be 1 to 2000 characters." } }),
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.add("x");
    });
    expect(outcome).toEqual({ ok: false, handled: false, fields: { content: "Must be 1 to 2000 characters." } });
    expect(ids(result.current.comments)).toEqual(["c1", "c2"]);
    expect(result.current.pending).toBe(false);
  });

  it("sends an AUTH_REQUIRED failure to the login redirect", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(401, "AUTH_REQUIRED"));
    await act(async () => {
      await result.current.add("x");
    });
    expect(hardRedirect).toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it("shows a retry notice for a 5xx on an edit or a delete and leaves the list as it was", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(500, "INTERNAL_ERROR"));
    const before = vi.mocked(apiGet).mock.calls.length;
    await act(async () => {
      await result.current.edit("c1", "x");
    });
    expect(result.current.notice).toEqual({ text: "Your comment was not saved. Try again.", retry: false });
    await act(async () => {
      await result.current.remove("c1");
    });
    expect(result.current.notice?.text).toBe("The comment was not deleted. Try again.");
    expect(ids(result.current.comments)).toEqual(["c1", "c2"]);
    expect(vi.mocked(apiGet).mock.calls.length).toBe(before); // no refetch for edit or delete
  });

  it("shows the author message for a 403 and reloads the list", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(403, "FORBIDDEN"));
    vi.mocked(apiGet).mockResolvedValue([wire(comment("c1")), wire(comment("c2")), wire(comment("c9"))]);
    await act(async () => {
      await result.current.edit("c1", "x");
    });
    expect(result.current.notice).toEqual({ text: "Only the author can change a comment.", retry: false });
    expect(ids(result.current.comments)).toEqual(["c1", "c2", "c9"]);
  });
});

describe("Property 19: a comment 404 is resolved by the board refetch", () => {
  it("reloads the comments and says the comment is gone when the card still exists (edit)", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    resolveNotFound.mockResolvedValue("card-present");
    vi.mocked(apiGet).mockResolvedValue([wire(comment("c2"))]);
    await act(async () => {
      await result.current.edit("c1", "x");
    });
    expect(resolveNotFound).toHaveBeenCalledTimes(1);
    expect(ids(result.current.comments)).toEqual(["c2"]);
    expect(result.current.notice).toEqual({ text: "That comment no longer exists.", retry: false });
    expect(onCardGone).not.toHaveBeenCalled();
  });

  it("closes the modal with a toast when the card is gone", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    resolveNotFound.mockResolvedValue("card-gone");
    await act(async () => {
      await result.current.add("x");
    });
    expect(notifyError).toHaveBeenCalledWith("That card no longer exists.");
    expect(onCardGone).toHaveBeenCalledTimes(1);
  });

  it("does nothing more when access is lost, because the board hook redirects", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    resolveNotFound.mockResolvedValue("access-lost");
    const before = vi.mocked(apiGet).mock.calls.length;
    await act(async () => {
      await result.current.remove("c1");
    });
    expect(vi.mocked(apiGet).mock.calls.length).toBe(before);
    expect(onCardGone).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("shows the refresh notice with Retry when the board refetch fails", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    resolveNotFound.mockResolvedValue("unknown");
    await act(async () => {
      await result.current.edit("c1", "x");
    });
    expect(result.current.notice).toEqual({ text: "Comments could not be refreshed.", retry: true });
    expect(ids(result.current.comments)).toEqual(["c1", "c2"]);
  });

  it("does not resolve a repeated 404 again, so there is no loop", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    resolveNotFound.mockResolvedValue("card-present");
    vi.mocked(apiGet).mockRejectedValue(apiError(404, "NOT_FOUND")); // the reload 404s again
    await act(async () => {
      await result.current.add("x");
    });
    expect(resolveNotFound).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toEqual({ text: "Comments could not be refreshed.", retry: true });
  });

  it("resolves a 404 on the first load: a present card reloads the list", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(404, "NOT_FOUND"));
    resolveNotFound.mockResolvedValue("card-present");
    vi.mocked(apiGet).mockResolvedValue([wire(comment("c1"))]);
    const { result } = renderHook(() => useCardComments({ cardId: CARD, resolveNotFound, onCardGone }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ids(result.current.comments)).toEqual(["c1"]);
  });

  it("resolves a 404 on the first load: a gone card closes the modal", async () => {
    vi.mocked(apiGet).mockRejectedValue(apiError(404, "NOT_FOUND"));
    resolveNotFound.mockResolvedValue("card-gone");
    renderHook(() => useCardComments({ cardId: CARD, resolveNotFound, onCardGone }));
    await waitFor(() => expect(onCardGone).toHaveBeenCalledTimes(1));
  });
});

describe("Property 13: stale responses are ignored", () => {
  it("ignores a write response and a load response that arrive after unmount", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValue(load.promise);
    const { result, unmount } = renderHook(() => useCardComments({ cardId: CARD, resolveNotFound, onCardGone }));
    unmount();
    await act(async () => {
      load.resolve([wire(comment("c1"))]);
    });
    expect(result.current.comments).toEqual([]);

    const reply = deferred<unknown>();
    vi.mocked(apiGet).mockResolvedValue([]);
    vi.mocked(apiRequest).mockReturnValue(reply.promise);
    const second = renderHook(() => useCardComments({ cardId: CARD, resolveNotFound, onCardGone }));
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
    let pending!: Promise<unknown>;
    act(() => {
      pending = second.result.current.add("late");
    });
    second.unmount();
    await act(async () => {
      reply.resolve(wire(comment("c5")));
      await pending;
    });
    expect(second.result.current.comments).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("aborts the load when it unmounts", async () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useCardComments({ cardId: CARD, resolveNotFound, onCardGone }));
    const signal = vi.mocked(apiGet).mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe("Property 17: an uncertain add (N5, DD15)", () => {
  it("keeps the list visible, refetches, enables a manual retry after review, and sends one POST on its own", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(503, "SERVICE_UNAVAILABLE"));
    const refetch = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValue(refetch.promise);

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.add("Maybe saved");
    });
    expect(outcome).toEqual({ ok: false, handled: true, uncertain: true });
    expect(result.current.addState).toBe("checking");
    expect(result.current.status).toBe("ready"); // not back to loading
    expect(ids(result.current.comments)).toEqual(["c1", "c2"]); // the current list stays visible
    expect(result.current.pending).toBe(true);
    expect(result.current.announcement).toMatch(/could not confirm/);

    // The add is blocked while the refetch runs.
    await act(async () => {
      await result.current.add("Maybe saved");
    });
    expect(posts()).toHaveLength(1);

    // The comment was saved while the response was lost: the refetch shows it.
    await act(async () => {
      refetch.resolve([wire(comment("c1")), wire(comment("c2")), wire(comment("c3", { content: "Maybe saved" }))]);
    });
    await waitFor(() => expect(result.current.addState).toBe("review"));
    expect(ids(result.current.comments)).toEqual(["c1", "c2", "c3"]);
    expect(result.current.pending).toBe(false);
    expect(result.current.announcement).toMatch(/may have been posted/);
    expect(posts()).toHaveLength(1); // no automatic retry

    // A manual retry sends a second POST. Nothing compares the text.
    vi.mocked(apiRequest).mockResolvedValue(wire(comment("c4", { content: "Maybe saved" })));
    await act(async () => {
      await result.current.add("Maybe saved");
    });
    expect(posts()).toHaveLength(2);
    expect(ids(result.current.comments)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(result.current.addState).toBe("idle");
  });

  it("treats a transport failure the same way", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(null, "NETWORK_ERROR"));
    vi.mocked(apiGet).mockResolvedValue([wire(comment("c1")), wire(comment("c2"))]);
    await act(async () => {
      await result.current.add("x");
    });
    await waitFor(() => expect(result.current.addState).toBe("review"));
    expect(posts()).toHaveLength(1);
  });

  it("keeps the add blocked when the refetch fails, until Refresh comments succeeds", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(500, "INTERNAL_ERROR"));
    vi.mocked(apiGet).mockRejectedValue(apiError(503, "SERVICE_UNAVAILABLE"));
    await act(async () => {
      await result.current.add("x");
    });
    await waitFor(() => expect(result.current.addState).toBe("refresh-failed"));
    expect(result.current.pending).toBe(false);
    expect(ids(result.current.comments)).toEqual(["c1", "c2"]);

    let blocked: unknown;
    await act(async () => {
      blocked = await result.current.add("x");
    });
    expect(blocked).toEqual({ ok: false, handled: true });
    expect(posts()).toHaveLength(1);

    vi.mocked(apiGet).mockResolvedValue([wire(comment("c1")), wire(comment("c2"))]);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.addState).toBe("review");
    vi.mocked(apiRequest).mockResolvedValue(wire(comment("c3")));
    await act(async () => {
      await result.current.add("x");
    });
    expect(posts()).toHaveLength(2);
  });

  it("does not treat a 400, a 403 or a 404 as uncertain", async () => {
    const { result } = await ready();
    vi.mocked(apiRequest).mockRejectedValue(apiError(403, "FORBIDDEN"));
    await act(async () => {
      await result.current.add("x");
    });
    expect(result.current.addState).toBe("idle");
  });
});
