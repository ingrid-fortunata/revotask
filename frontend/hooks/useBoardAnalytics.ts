"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { analyticsPath, parseAnalytics } from "@/lib/analytics";
import { apiGet } from "@/lib/apiClient";
import { isBoardAccessError } from "@/lib/boardErrors";
import { ApiError } from "@/lib/errors";
import type { BoardAnalytics } from "@/lib/types";

export const ANALYTICS_ERROR_MESSAGE = "Analytics could not be loaded.";

export interface UseBoardAnalyticsOptions {
  boardId: string;
  /** The Kanban `position_version`. A rise above the version of the last read starts a new read. */
  version: number;
  /** Called on a 404: the board is gone or the caller lost access. The board shows the toast and leaves. */
  onAccessLost: () => void;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

// Board analytics read (Requirements 6.4 to 6.8; design DD9, DD11). One read runs at a time. It
// starts on mount and board change, when `version` rises above the version of the last read, and
// on `refresh`. Every read takes a sequence number and an AbortController, so an earlier, aborted
// or earlier-board response never reaches the state. Errors stay here: the hook never throws and
// keeps the last figures, so the board is never disturbed. It reads no Kanban gate and does not poll.
export function useBoardAnalytics({ boardId, version, onAccessLost }: UseBoardAnalyticsOptions) {
  const { handleError } = useErrorHandler();
  // The figures are stored with the board they belong to, so a board change shows none of them.
  const [held, setHeld] = useState<{ boardId: string; data: BoardAnalytics } | null>(null);
  const [failedBoard, setFailedBoard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const versionRef = useRef(version);
  const startedVersionRef = useRef(version);
  const callbacks = useRef({ onAccessLost, handleError });
  useEffect(() => {
    versionRef.current = version;
    callbacks.current = { onAccessLost, handleError };
  });

  const read = useCallback(async () => {
    controllerRef.current?.abort();
    const sequence = ++sequenceRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    startedVersionRef.current = versionRef.current;
    setBusy(true);
    const stale = () => sequence !== sequenceRef.current || controller.signal.aborted;
    try {
      const data = parseAnalytics(await apiGet<unknown>(analyticsPath(boardId), controller.signal));
      if (stale()) return;
      setHeld({ boardId, data });
      setFailedBoard(null);
      setBusy(false);
    } catch (error) {
      if (isAbort(error) || stale()) return;
      setBusy(false);
      if (isBoardAccessError(error)) {
        callbacks.current.onAccessLost();
        return;
      }
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
        callbacks.current.handleError(error);
        return;
      }
      setFailedBoard(boardId); // a 400, a 5xx, a transport error or a malformed body
    }
  }, [boardId]);

  // Mount and board change. The cleanup aborts and invalidates the read of the board we leave.
  useEffect(() => {
    // read() starts an external request and flags it in flight, which is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read();
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      sequenceRef.current += 1;
    };
  }, [read]);

  // A rise above the version of the last read: the user's own card or column change (A8).
  useEffect(() => {
    if (version > startedVersionRef.current) void read();
  }, [version, read]);

  const data = held && held.boardId === boardId ? held.data : null;
  const error = failedBoard === boardId ? ANALYTICS_ERROR_MESSAGE : null;
  return {
    data,
    // "loading": nothing to show yet. "ready": figures are held (a refresh keeps them, with busy).
    status: data === null && error === null ? ("loading" as const) : ("ready" as const),
    busy,
    error,
    refresh: read,
  };
}
