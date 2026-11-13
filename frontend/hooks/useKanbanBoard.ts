"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiGet, apiRequest } from "@/lib/apiClient";
import {
  BOARD_ACCESS_MESSAGE,
  isBoardAccessError,
  isForbiddenError,
  isInvalidDestination,
  isPositionConflict,
  isStateConflict,
  KANBAN_MESSAGES,
} from "@/lib/boardErrors";
import { parseBoardDetail } from "@/lib/boards";
import { ApiError } from "@/lib/errors";
import {
  parseCard,
  parseCardCreated,
  parseCardMoved,
  parseColumn,
  parseColumnCreated,
  parseColumnReordered,
  parseVersionOnly,
} from "@/lib/kanban";
import {
  applyCardMove,
  applyColumnMove,
  applyColumnOrder,
  columnMoveAnnouncement,
  isCardUnchanged,
  isColumnUnchanged,
  mergeAffected,
  moveAnnouncement,
} from "@/lib/kanbanMove";
import { notifyError } from "@/lib/toast";
import type { Card, Column, ColumnWithCards } from "@/lib/types";

export type KanbanStatus = "idle" | "pending" | "refetching" | "stale";

/** The outcome of one write. `handled` is true when the hook already told the user. */
export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown; handled: boolean };

export interface UseKanbanBoardOptions {
  boardId: string;
  /** The server read from the page. The state is seeded once and later renders do not replace it. */
  initial: { columns: ColumnWithCards[]; version: number };
}

type Kind = "card-move" | "column-move" | "write";

type Applied = { columns: ColumnWithCards[]; version?: number; announcement?: string };

interface RunSpec<T> {
  kind: Kind;
  /** Optimistic change applied before the request. Present only for E16 and E20. */
  optimistic?: (columns: ColumnWithCards[]) => ColumnWithCards[];
  call: (version: number) => Promise<T>;
  apply: (columns: ColumnWithCards[], value: T) => Applied;
  /** Field errors and STATE_CONFLICT go back to the caller, which shows them beside the control. */
  form?: boolean;
}

/** How a board refetch ended: applied, discarded as stale, the board is gone, or it failed. */
export type FetchOutcome = "applied" | "discarded" | "gone" | "failed";

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

// Board state for the Kanban island (design DD9, K8, K12, L2). One gate serializes every write and
// every board refetch: while it is held nothing else starts, so an edit cannot be undone by a
// rollback and a refetch cannot overwrite a newer board. A write keeps the gate through its own
// recovery refetch. A refresh requested while the gate is held (after a member removal) runs when
// it is released. A response from an older epoch, or after unmount, is ignored.
export function useKanbanBoard({ boardId, initial }: UseKanbanBoardOptions) {
  const router = useRouter();
  const { handleError } = useErrorHandler();
  const [columns, setColumns] = useState(initial.columns);
  const [version, setVersion] = useState(initial.version);
  const [status, setStatusState] = useState<KanbanStatus>("idle");
  const [announcement, setAnnouncement] = useState("");

  const columnsRef = useRef(initial.columns);
  const versionRef = useRef(initial.version);
  const statusRef = useRef<KanbanStatus>("idle");
  const epochRef = useRef(0);
  const mountedRef = useRef(true);
  const refreshQueuedRef = useRef(false);
  const refreshWaitersRef = useRef<Array<(outcome: FetchOutcome) => void>>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function setStatus(next: KanbanStatus) {
    statusRef.current = next;
    if (mountedRef.current) setStatusState(next);
  }

  function announce(text: string) {
    if (mountedRef.current) setAnnouncement(text);
  }

  function replaceBoard(nextColumns: ColumnWithCards[], nextVersion?: number) {
    columnsRef.current = nextColumns;
    if (nextVersion !== undefined) versionRef.current = nextVersion;
    epochRef.current += 1;
    if (!mountedRef.current) return;
    setColumns(nextColumns);
    if (nextVersion !== undefined) setVersion(nextVersion);
  }

  async function fetchBoard(): Promise<FetchOutcome> {
    const startEpoch = epochRef.current;
    try {
      const detail = parseBoardDetail(await apiGet<unknown>(`/api/boards/${boardId}`));
      if (!mountedRef.current || epochRef.current !== startEpoch) return "discarded";
      replaceBoard(detail.columns, detail.position_version);
      return "applied";
    } catch (error) {
      if (isBoardAccessError(error)) {
        notifyError(BOARD_ACCESS_MESSAGE);
        router.push("/");
        return "gone";
      }
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
        handleError(error);
        return "gone";
      }
      return "failed";
    }
  }

  // Runs a refetch while holding the gate, then releases it. A failed refetch leaves the gate held
  // in the `stale` state, so no position control works until Reload board succeeds.
  async function refetchHoldingGate(): Promise<FetchOutcome> {
    setStatus("refetching");
    const outcome = await fetchBoard();
    if (outcome === "failed") {
      setStatus("stale");
      announce(KANBAN_MESSAGES.reloadFailed);
      return outcome;
    }
    release();
    return outcome;
  }

  function release() {
    setStatus("idle");
    if (refreshQueuedRef.current) {
      refreshQueuedRef.current = false;
      void refreshWhenIdle();
    }
  }

  async function refreshWhenIdle() {
    if (statusRef.current !== "idle") {
      refreshQueuedRef.current = true;
      return;
    }
    const outcome = await refetchHoldingGate();
    // Whoever asked for a refresh with refreshBoard() learns how this refetch ended.
    for (const resolve of refreshWaitersRef.current.splice(0)) resolve(outcome);
  }

  async function recover<T>(error: unknown, spec: RunSpec<T>, snapshot: ColumnWithCards[]): Promise<boolean> {
    if (spec.optimistic) replaceBoard(snapshot);
    const isMove = spec.kind !== "write";
    const notMoved = spec.kind === "column-move" ? KANBAN_MESSAGES.columnNotMoved : KANBAN_MESSAGES.cardNotMoved;
    const notMovedRefreshed =
      spec.kind === "column-move" ? KANBAN_MESSAGES.columnNotMovedRefreshed : KANBAN_MESSAGES.cardNotMovedRefreshed;

    if (isAbort(error)) {
      release();
      return true;
    }
    if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
      handleError(error);
      release();
      return true;
    }
    if (isForbiddenError(error)) {
      notifyError(KANBAN_MESSAGES.accessChanged);
      announce(KANBAN_MESSAGES.accessChanged);
      router.refresh();
      release();
      return true;
    }
    // Field errors from a form: no refetch, the form shows them and keeps the input.
    if (spec.form && error instanceof ApiError && error.statusCode === 400 && error.fields) {
      release();
      return false;
    }
    // A column rule (second Done column, nonempty column): the form shows it, the board refetches.
    if (spec.form && isStateConflict(error)) {
      await refetchHoldingGate();
      return false;
    }
    if (isPositionConflict(error)) {
      notifyError(KANBAN_MESSAGES.boardChanged);
      announce(KANBAN_MESSAGES.boardChanged);
      await refetchHoldingGate();
      return true;
    }
    if (isInvalidDestination(error)) {
      notifyError(notMovedRefreshed);
      announce(notMovedRefreshed);
      await refetchHoldingGate();
      return true;
    }
    // The server answers 404 for a missing card or column and for lost board access alike. The
    // refetch tells them apart: a 404 there means the board is gone and fetchBoard leaves the page.
    if (error instanceof ApiError && error.statusCode === 404) {
      const outcome = await refetchHoldingGate();
      if (outcome === "applied") {
        notifyError(KANBAN_MESSAGES.itemGone);
        announce(KANBAN_MESSAGES.itemGone);
      }
      return true;
    }
    const message =
      isStateConflict(error) && error instanceof ApiError ? error.message : isMove ? notMoved : KANBAN_MESSAGES.notSaved;
    notifyError(message);
    announce(message);
    await refetchHoldingGate();
    return true;
  }

  async function run<T>(spec: RunSpec<T>): Promise<WriteResult<T>> {
    if (statusRef.current !== "idle") return { ok: false, error: undefined, handled: true };
    setStatus("pending");
    epochRef.current += 1;
    const snapshot = columnsRef.current;
    if (spec.optimistic) replaceBoard(spec.optimistic(snapshot));
    try {
      const value = await spec.call(versionRef.current);
      const applied = spec.apply(columnsRef.current, value);
      replaceBoard(applied.columns, applied.version);
      if (applied.announcement) announce(applied.announcement);
      release();
      return { ok: true, value };
    } catch (error) {
      const handled = await recover(error, spec, snapshot);
      return { ok: false, error, handled };
    }
  }

  // ---- moves (optimistic, E16 and E20) ----

  /** The Move_Function: drag and the Move dialog both call this. Resolves true when nothing failed. */
  async function moveCard(cardId: string, columnId: string, beforeCardId: string | null): Promise<boolean> {
    if (statusRef.current !== "idle") return false;
    if (isCardUnchanged(columnsRef.current, cardId, columnId, beforeCardId)) return true;
    const result = await run({
      kind: "card-move",
      optimistic: (current) => applyCardMove(current, cardId, columnId, beforeCardId),
      call: async (expected) =>
        parseCardMoved(
          await apiRequest<unknown>("PATCH", `/api/cards/${cardId}/position`, {
            column_id: columnId,
            before_card_id: beforeCardId,
            expected_position_version: expected,
          }),
        ),
      apply: (current, moved) => {
        const merged = mergeAffected(current, moved.columns);
        return {
          columns: merged,
          version: moved.position_version,
          announcement: moveAnnouncement(merged, cardId),
        };
      },
    });
    return result.ok;
  }

  async function moveColumn(columnId: string, beforeColumnId: string | null): Promise<boolean> {
    if (statusRef.current !== "idle") return false;
    if (isColumnUnchanged(columnsRef.current, columnId, beforeColumnId)) return true;
    const result = await run({
      kind: "column-move",
      optimistic: (current) => applyColumnMove(current, columnId, beforeColumnId),
      call: async (expected) =>
        parseColumnReordered(
          await apiRequest<unknown>("PATCH", `/api/boards/${boardId}/columns/reorder`, {
            column_id: columnId,
            before_column_id: beforeColumnId,
            expected_position_version: expected,
          }),
        ),
      apply: (current, reordered) => {
        const next = applyColumnOrder(current, reordered.columns);
        return {
          columns: next,
          version: reordered.position_version,
          announcement: columnMoveAnnouncement(next, columnId),
        };
      },
    });
    return result.ok;
  }

  // ---- writes (E13 to E15, E17 to E19; applied from the response) ----

  function addColumn(name: string, isDone: boolean): Promise<WriteResult<Column>> {
    return run({
      kind: "write",
      form: true,
      call: async () =>
        parseColumnCreated(
          await apiRequest<unknown>("POST", `/api/boards/${boardId}/columns`, { name, is_done: isDone }),
        ),
      apply: (current, created) => ({
        columns: [...current, { ...created.column, cards: [] }],
        version: created.position_version,
        announcement: `Added column ${created.column.name}.`,
      }),
    }).then(unwrap((created) => created.column));
  }

  function editColumn(
    columnId: string,
    patch: { name?: string; is_done?: boolean },
  ): Promise<WriteResult<Column>> {
    return run({
      kind: "write",
      form: true,
      call: async () => parseColumn(await apiRequest<unknown>("PATCH", `/api/columns/${columnId}`, patch)),
      apply: (current, column) => ({
        columns: current.map((item) => (item.id === column.id ? { ...item, ...column } : item)),
        announcement: `Saved column ${column.name}.`,
      }),
    });
  }

  function deleteColumn(columnId: string): Promise<WriteResult<number>> {
    return run({
      kind: "write",
      form: true,
      call: async () => parseVersionOnly(await apiRequest<unknown>("DELETE", `/api/columns/${columnId}`)),
      apply: (current, result) => ({
        columns: current.filter((item) => item.id !== columnId),
        version: result.position_version,
        announcement: "Deleted the column.",
      }),
    }).then(unwrap((result) => result.position_version));
  }

  function addCard(columnId: string, title: string): Promise<WriteResult<Card>> {
    return run({
      kind: "write",
      form: true,
      call: async () =>
        parseCardCreated(await apiRequest<unknown>("POST", `/api/columns/${columnId}/cards`, { title })),
      apply: (current, created) => ({
        columns: current.map((item) =>
          item.id === created.card.column_id ? { ...item, cards: [...item.cards, created.card] } : item,
        ),
        version: created.position_version,
        announcement: `Added card ${created.card.title}.`,
      }),
    }).then(unwrap((created) => created.card));
  }

  function editCard(
    cardId: string,
    patch: { title?: string; description?: string | null; assignee_id?: string | null },
  ): Promise<WriteResult<Card>> {
    return run({
      kind: "write",
      form: true,
      call: async () => parseCard(await apiRequest<unknown>("PATCH", `/api/cards/${cardId}`, patch)),
      apply: (current, card) => ({
        columns: current.map((item) => ({
          ...item,
          cards: item.cards.map((existing) => (existing.id === card.id ? card : existing)),
        })),
        announcement: `Saved card ${card.title}.`,
      }),
    });
  }

  function deleteCard(cardId: string): Promise<WriteResult<number>> {
    return run({
      kind: "write",
      form: true,
      call: async () => parseVersionOnly(await apiRequest<unknown>("DELETE", `/api/cards/${cardId}`)),
      apply: (current, result) => ({
        columns: current.map((item) => ({ ...item, cards: item.cards.filter((card) => card.id !== cardId) })),
        version: result.position_version,
        announcement: "Deleted the card.",
      }),
    }).then(unwrap((result) => result.position_version));
  }

  /** Refetch the board after a member removal (K12). Waits for a pending write. */
  function requestRefresh(): void {
    void refreshWhenIdle();
  }

  /**
   * Refetch the board behind the gate and resolve with how it ended (comments design DD10). While
   * the gate is held it waits and resolves with the queued refetch's outcome, as `requestRefresh`
   * queues. A board 404 has already shown the access toast and left the page when this resolves
   * with `gone`.
   */
  function refreshBoard(): Promise<FetchOutcome> {
    return new Promise((resolve) => {
      refreshWaitersRef.current.push(resolve);
      void refreshWhenIdle();
    });
  }

  /** True while the card is on the current board state. Reads the latest state, not a render. */
  function hasCard(cardId: string): boolean {
    return columnsRef.current.some((column) => column.cards.some((card) => card.id === cardId));
  }

  /** The Reload board action in the `stale` state. */
  async function reload(): Promise<void> {
    if (statusRef.current !== "stale") return;
    await refetchHoldingGate();
  }

  return {
    columns,
    version,
    status,
    busy: status !== "idle",
    announcement,
    moveCard,
    moveColumn,
    addColumn,
    editColumn,
    deleteColumn,
    addCard,
    editCard,
    deleteCard,
    requestRefresh,
    refreshBoard,
    hasCard,
    reload,
  };
}

function unwrap<A, B>(pick: (value: A) => B) {
  return (result: WriteResult<A>): WriteResult<B> =>
    result.ok ? { ok: true, value: pick(result.value) } : result;
}
