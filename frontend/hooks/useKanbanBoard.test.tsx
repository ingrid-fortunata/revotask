import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { Card, ColumnWithCards } from "@/lib/types";
import { useKanbanBoard } from "./useKanbanBoard";

// Feature: kanban, Properties 15 and 16, and the failure table of design "Board state and the gate".

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: vi.fn(), apiGet: vi.fn() }));
vi.mock("@/lib/toast", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ hardRedirect: vi.fn() }));

const BOARD_ID = "b0000000-0000-4000-8000-000000000000";

function card(id: string, columnId: string, order: number): Card {
  return { id, column_id: columnId, title: `Card ${id}`, description: null, assignee_id: null, assignee_name: null, order };
}
function column(id: string, order: number, cards: Card[], name = `Col ${id}`): ColumnWithCards {
  return { id, board_id: BOARD_ID, name, is_done: false, order, cards };
}
const board = (): ColumnWithCards[] => [
  column("todo", 1024, [card("a", "todo", 1024), card("b", "todo", 2048)]),
  column("doing", 2048, [card("d", "doing", 1024)]),
];
const detail = (columns: ColumnWithCards[], version: number) => ({
  id: BOARD_ID,
  name: "Board",
  role: "admin",
  position_version: version,
  columns,
});
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

const moveReply = (columns: ColumnWithCards[], version: number, cardId = "a") => ({
  card: columns.flatMap((c) => c.cards).find((c) => c.id === cardId),
  columns,
  position_version: version,
});

function setup(columns = board(), version = 3) {
  return renderHook(() => useKanbanBoard({ boardId: BOARD_ID, initial: { columns, version } }));
}
const ids = (columns: ColumnWithCards[], columnId: string) => columns.find((c) => c.id === columnId)?.cards.map((c) => c.id);

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiGet).mockReset();
  vi.mocked(notifyError).mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
});

describe("moveCard: success", () => {
  it("shows the move at once, sends the current version and merges the server answer", async () => {
    const reply = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValue(reply.promise);
    const { result } = setup();

    let done!: Promise<boolean>;
    act(() => {
      done = result.current.moveCard("a", "doing", null);
    });
    // Optimistic: card a is already in Doing, and the board is busy.
    expect(ids(result.current.columns, "doing")).toEqual(["d", "a"]);
    expect(result.current.status).toBe("pending");
    expect(result.current.busy).toBe(true);
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/cards/a/position", {
      column_id: "doing",
      before_card_id: null,
      expected_position_version: 3,
    });

    const authoritative = [column("todo", 1024, [card("b", "todo", 1024)]), column("doing", 2048, [card("d", "doing", 1024), card("a", "doing", 2048)])];
    await act(async () => {
      reply.resolve(moveReply(authoritative, 4));
      await done;
    });
    expect(await done).toBe(true);
    expect(result.current.version).toBe(4);
    expect(result.current.columns[1].cards.map((c) => c.order)).toEqual([1024, 2048]);
    expect(result.current.status).toBe("idle");
    expect(result.current.announcement).toBe("Moved Card a to Col doing, position 2 of 2.");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("sends no request for an unchanged place", async () => {
    const { result } = setup();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.moveCard("b", "todo", null); // b is already last in Todo
    });
    expect(ok).toBe(true);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });
});

describe("moveCard: failures", () => {
  async function failWith(error: unknown, serverBoard = board(), serverVersion = 9) {
    vi.mocked(apiRequest).mockRejectedValue(error);
    vi.mocked(apiGet).mockResolvedValue(detail(serverBoard, serverVersion));
    const hook = setup();
    await act(async () => {
      await hook.result.current.moveCard("a", "doing", null);
    });
    return hook;
  }

  it("rolls back and refetches after a 500", async () => {
    const server = [column("todo", 1024, [card("a", "todo", 1024), card("b", "todo", 2048), card("n", "todo", 4096)]), column("doing", 2048, [card("d", "doing", 1024)])];
    const { result } = await failWith(apiError(500, "INTERNAL_ERROR"), server);
    expect(apiGet).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}`);
    expect(ids(result.current.columns, "todo")).toEqual(["a", "b", "n"]);
    expect(result.current.version).toBe(9);
    expect(notifyError).toHaveBeenCalledWith("The card was not moved. Try again.");
    expect(result.current.status).toBe("idle");
  });

  it("restores the snapshot, refetches and says the board changed after a 409 POSITION_CONFLICT", async () => {
    const { result } = await failWith(apiError(409, "POSITION_CONFLICT"));
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(ids(result.current.columns, "doing")).toEqual(["d"]);
    expect(notifyError).toHaveBeenCalledWith("The board changed. It has been refreshed.");
    expect(result.current.announcement).toBe("The board changed. It has been refreshed.");
    expect(result.current.version).toBe(9);
  });

  it("refetches after a transport failure", async () => {
    await failWith(apiError(null, "SERVICE_UNAVAILABLE"));
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith("The card was not moved. Try again.");
  });

  it("restores and refetches after a 400 for an invalid destination", async () => {
    await failWith(apiError(400, "VALIDATION_ERROR"));
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith("The card was not moved. The board was refreshed.");
  });

  it("restores without a refetch after a 403 and refreshes the page", async () => {
    vi.mocked(apiRequest).mockRejectedValue(apiError(403, "FORBIDDEN"));
    const { result } = setup();
    await act(async () => {
      await result.current.moveCard("a", "doing", null);
    });
    expect(apiGet).not.toHaveBeenCalled();
    expect(ids(result.current.columns, "todo")).toEqual(["a", "b"]);
    expect(router.refresh).toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith("You no longer have permission for that action.");
    expect(result.current.status).toBe("idle");
  });

  it("leaves the page when the 404 is the board itself", async () => {
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    vi.mocked(apiGet).mockRejectedValue(apiError(404, "NOT_FOUND"));
    const { result } = setup();
    await act(async () => {
      await result.current.moveCard("a", "doing", null);
    });
    expect(notifyError).toHaveBeenCalledWith("You no longer have access to this board.");
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("toasts and keeps the board when only the card is gone", async () => {
    vi.mocked(apiRequest).mockRejectedValue(apiError(404, "NOT_FOUND"));
    vi.mocked(apiGet).mockResolvedValue(detail(board(), 5));
    const { result } = setup();
    await act(async () => {
      await result.current.moveCard("a", "doing", null);
    });
    expect(notifyError).toHaveBeenCalledWith("That item no longer exists. The board was refreshed.");
    expect(router.push).not.toHaveBeenCalled();
    expect(result.current.version).toBe(5);
  });

  it("shows the server message for a STATE_CONFLICT on a move (the version limit)", async () => {
    await failWith(apiError(409, "STATE_CONFLICT"));
    expect(notifyError).toHaveBeenCalledWith("m STATE_CONFLICT");
  });
});

describe("Property 15: the gate", () => {
  it("ignores a second request and a drag while one is pending, and disables the board", async () => {
    const first = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValue(first.promise);
    const { result } = setup();
    act(() => {
      void result.current.moveCard("a", "doing", null);
    });
    let second!: boolean;
    let third: unknown;
    await act(async () => {
      second = await result.current.moveCard("b", "doing", null);
      third = await result.current.addCard("todo", "New");
      await result.current.moveColumn("doing", "todo");
    });
    expect(second).toBe(false);
    expect(third).toMatchObject({ ok: false });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);
    await act(async () => {
      first.resolve(moveReply(board(), 4));
    });
    expect(result.current.status).toBe("idle");
  });

  it("keeps the gate through the write's own recovery refetch", async () => {
    vi.mocked(apiRequest).mockRejectedValue(apiError(500, "INTERNAL_ERROR"));
    const refetch = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValue(refetch.promise);
    const { result } = setup();
    act(() => {
      void result.current.moveCard("a", "doing", null);
    });
    await waitFor(() => expect(result.current.status).toBe("refetching"));
    // While the recovery refetch runs, competing actions stay disabled.
    let competing!: boolean;
    await act(async () => {
      competing = await result.current.moveCard("b", "doing", null);
    });
    expect(competing).toBe(false);
    await act(async () => {
      refetch.resolve(detail(board(), 8));
    });
    await waitFor(() => expect(result.current.status).toBe("idle"));
  });

  it("goes stale when the refetch fails, blocks every action, and Reload board recovers", async () => {
    vi.mocked(apiRequest).mockRejectedValue(apiError(409, "POSITION_CONFLICT"));
    vi.mocked(apiGet).mockRejectedValueOnce(apiError(null, "SERVICE_UNAVAILABLE"));
    const { result } = setup();
    await act(async () => {
      await result.current.moveCard("a", "doing", null);
    });
    expect(result.current.status).toBe("stale");
    expect(result.current.announcement).toBe("The board could not be refreshed. Reload the board to continue.");

    vi.mocked(apiRequest).mockClear();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.moveCard("b", "doing", null);
    });
    expect(ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();

    vi.mocked(apiGet).mockResolvedValueOnce(detail(board(), 11));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.version).toBe(11);
  });

  it("does nothing on reload() unless the board is stale", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.reload();
    });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("an edit cannot be undone by a later rollback: the snapshot includes it", async () => {
    const { result } = setup();
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "todo", board_id: BOARD_ID, name: "Renamed", is_done: false, order: 1024 });
    await act(async () => {
      await result.current.editColumn("todo", { name: "Renamed" });
    });
    expect(result.current.columns[0].name).toBe("Renamed");

    const refetch = deferred<unknown>();
    vi.mocked(apiRequest).mockRejectedValueOnce(apiError(500, "INTERNAL_ERROR"));
    vi.mocked(apiGet).mockReturnValue(refetch.promise);
    act(() => {
      void result.current.moveCard("a", "doing", null);
    });
    await waitFor(() => expect(result.current.status).toBe("refetching"));
    // Rolled back to the state before the move, which already has the rename.
    expect(result.current.columns[0].name).toBe("Renamed");
    expect(ids(result.current.columns, "todo")).toEqual(["a", "b"]);
    await act(async () => {
      refetch.resolve(detail(board(), 3));
    });
  });
});

describe("Property 16: refresh coordination (K12)", () => {
  it("runs a requested refresh at once when idle", async () => {
    vi.mocked(apiGet).mockResolvedValue(detail([column("todo", 1024, [card("a", "todo", 1024)])], 7));
    const { result } = setup();
    act(() => {
      result.current.requestRefresh();
    });
    await waitFor(() => expect(result.current.version).toBe(7));
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  it("defers a refresh while a move is pending and runs it after the move settles", async () => {
    const move = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValue(move.promise);
    vi.mocked(apiGet).mockResolvedValue(detail([column("todo", 1024, [card("a", "todo", 1024)]), column("doing", 2048, [])], 6));
    const { result } = setup();
    act(() => {
      void result.current.moveCard("a", "doing", null);
    });
    act(() => {
      result.current.requestRefresh();
    });
    expect(apiGet).not.toHaveBeenCalled(); // the refetch waits for the move

    await act(async () => {
      move.resolve(moveReply([column("todo", 1024, [card("b", "todo", 1024)]), column("doing", 2048, [card("d", "doing", 1024), card("a", "doing", 2048)])], 4));
    });
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.version).toBe(6));
    // The refreshed board is the final state: the older move answer did not win.
    expect(ids(result.current.columns, "todo")).toEqual(["a"]);
    expect(result.current.status).toBe("idle");
  });

  it("runs one refresh for several requests during a write", async () => {
    const move = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValue(move.promise);
    vi.mocked(apiGet).mockResolvedValue(detail(board(), 6));
    const { result } = setup();
    act(() => {
      void result.current.moveCard("a", "doing", null);
    });
    act(() => {
      result.current.requestRefresh();
      result.current.requestRefresh();
    });
    await act(async () => {
      move.resolve(moveReply(board(), 4));
    });
    await waitFor(() => expect(result.current.version).toBe(6));
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("ignores a refetch response that arrives after unmount", async () => {
    const refetch = deferred<unknown>();
    vi.mocked(apiGet).mockReturnValue(refetch.promise);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = setup();
    act(() => {
      result.current.requestRefresh();
    });
    unmount();
    await act(async () => {
      refetch.resolve(detail(board(), 12));
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("writes", () => {
  it("adds a column from the response and returns it", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      column: { id: "new", board_id: BOARD_ID, name: "Review", is_done: false, order: 3072 },
      position_version: 4,
    });
    const { result } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.addColumn("Review", false);
    });
    expect(apiRequest).toHaveBeenCalledWith("POST", `/api/boards/${BOARD_ID}/columns`, { name: "Review", is_done: false });
    expect(outcome).toMatchObject({ ok: true, value: { id: "new" } });
    expect(result.current.columns.map((c) => c.id)).toEqual(["todo", "doing", "new"]);
    expect(result.current.columns[2].cards).toEqual([]);
    expect(result.current.version).toBe(4);
  });

  it("adds, edits and deletes a card from the responses", async () => {
    const { result } = setup();
    vi.mocked(apiRequest).mockResolvedValueOnce({ card: card("n", "doing", 2048), position_version: 4 });
    await act(async () => {
      await result.current.addCard("doing", "Card n");
    });
    expect(ids(result.current.columns, "doing")).toEqual(["d", "n"]);

    vi.mocked(apiRequest).mockResolvedValueOnce({ ...card("n", "doing", 2048), title: "Edited", assignee_name: "Ada", assignee_id: "u1" });
    await act(async () => {
      await result.current.editCard("n", { title: "Edited", assignee_id: "u1" });
    });
    expect(result.current.columns[1].cards[1]).toMatchObject({ title: "Edited", assignee_name: "Ada" });
    expect(result.current.version).toBe(4); // an edit does not change the version

    vi.mocked(apiRequest).mockResolvedValueOnce({ position_version: 5 });
    await act(async () => {
      await result.current.deleteCard("n");
    });
    expect(ids(result.current.columns, "doing")).toEqual(["d"]);
    expect(result.current.version).toBe(5);
  });

  it("deletes a column and renames one without touching its cards", async () => {
    const { result } = setup();
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "todo", board_id: BOARD_ID, name: "Backlog", is_done: false, order: 1024 });
    await act(async () => {
      await result.current.editColumn("todo", { name: "Backlog" });
    });
    expect(result.current.columns[0]).toMatchObject({ name: "Backlog" });
    expect(ids(result.current.columns, "todo")).toEqual(["a", "b"]);
    vi.mocked(apiRequest).mockResolvedValueOnce({ position_version: 4 });
    await act(async () => {
      await result.current.deleteColumn("doing");
    });
    expect(result.current.columns.map((c) => c.id)).toEqual(["todo"]);
  });

  it("moves a column optimistically and applies the server order", async () => {
    const reply = deferred<unknown>();
    vi.mocked(apiRequest).mockReturnValue(reply.promise);
    const { result } = setup();
    let done!: Promise<boolean>;
    act(() => {
      done = result.current.moveColumn("doing", "todo");
    });
    expect(result.current.columns.map((c) => c.id)).toEqual(["doing", "todo"]);
    expect(apiRequest).toHaveBeenCalledWith("PATCH", `/api/boards/${BOARD_ID}/columns/reorder`, {
      column_id: "doing",
      before_column_id: "todo",
      expected_position_version: 3,
    });
    await act(async () => {
      reply.resolve({
        columns: [
          { id: "doing", board_id: BOARD_ID, name: "Col doing", is_done: false, order: 512 },
          { id: "todo", board_id: BOARD_ID, name: "Col todo", is_done: false, order: 1024 },
        ],
        position_version: 4,
      });
      await done;
    });
    expect(result.current.columns.map((c) => c.order)).toEqual([512, 1024]);
    expect(ids(result.current.columns, "todo")).toEqual(["a", "b"]);
    expect(result.current.announcement).toBe("Moved column Col doing, position 1 of 2.");
    expect(result.current.version).toBe(4);
  });

  it("returns a 400 with fields to the form without a refetch or a toast", async () => {
    const error = apiError(400, "VALIDATION_ERROR", { fields: { title: "Must be 1 to 160 characters." } });
    vi.mocked(apiRequest).mockRejectedValue(error);
    const { result } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.addCard("todo", "");
    });
    expect(outcome).toEqual({ ok: false, error, handled: false });
    expect(apiGet).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("returns a STATE_CONFLICT to the form and refetches the board", async () => {
    const error = apiError(409, "STATE_CONFLICT");
    vi.mocked(apiRequest).mockRejectedValue(error);
    vi.mocked(apiGet).mockResolvedValue(detail(board(), 6));
    const { result } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.editColumn("todo", { is_done: true });
    });
    expect(outcome).toEqual({ ok: false, error, handled: false });
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(notifyError).not.toHaveBeenCalled();
    expect(result.current.version).toBe(6);
  });

  it("toasts and refetches after a 500 on a write", async () => {
    vi.mocked(apiRequest).mockRejectedValue(apiError(500, "INTERNAL_ERROR"));
    vi.mocked(apiGet).mockResolvedValue(detail(board(), 6));
    const { result } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.deleteCard("a");
    });
    expect(outcome).toMatchObject({ ok: false, handled: true });
    expect(notifyError).toHaveBeenCalledWith("Your change was not saved. Try again.");
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
