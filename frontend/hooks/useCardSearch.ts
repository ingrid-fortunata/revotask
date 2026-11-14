"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiGet } from "@/lib/apiClient";
import { isBoardAccessError } from "@/lib/boardErrors";
import { cardSearchPath, parseSearchResults, SEARCH_DEBOUNCE_MS } from "@/lib/cardSearch";
import { ApiError } from "@/lib/errors";
import type { HeldSearch } from "@/lib/types";

export type SearchStatus = "idle" | "loading" | "ready" | "error";

export interface UseCardSearchOptions {
  boardId: string;
  /** Called on a 404: the board is gone or the caller lost access. The board shows the toast and leaves. */
  onAccessLost: () => void;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

// Debounced board search (Requirements 5.2 to 5.4, 5.11; design "Hook"; S6, Q3). The field text is
// kept as typed. A request is sent for the trimmed text only, 300 ms after the last change that
// changed it. Every request takes a sequence number and an AbortController, so an earlier or
// aborted response never reaches the state. The held response is kept as returned: the component
// decides what is visible from the live board (S8). The hook does not read the Kanban gate (S8).
export function useCardSearch({ boardId, onAccessLost }: UseCardSearchOptions) {
  const { handleError } = useErrorHandler();
  const [query, setQueryText] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [held, setHeld] = useState<HeldSearch | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  // The trimmed text of the held response or of the request in flight. Null after an error or a clear.
  const lastQueryRef = useRef<string | null>(null);
  const callbacks = useRef({ onAccessLost, handleError });
  useEffect(() => {
    callbacks.current = { onAccessLost, handleError };
  });

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    sequenceRef.current += 1;
  }, []);

  const run = useCallback(
    async (trimmed: string) => {
      if (controllerRef.current) controllerRef.current.abort();
      const sequence = ++sequenceRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      lastQueryRef.current = trimmed;
      try {
        const data = await apiGet<unknown>(cardSearchPath(boardId, trimmed), controller.signal);
        const items = parseSearchResults(data);
        if (sequence !== sequenceRef.current || controller.signal.aborted) return;
        setHeld({ query: trimmed, items });
        setStatus("ready");
      } catch (error) {
        if (isAbort(error) || sequence !== sequenceRef.current || controller.signal.aborted) return;
        lastQueryRef.current = null;
        setHeld(null);
        if (isBoardAccessError(error)) {
          callbacks.current.onAccessLost();
          setStatus("error");
          return;
        }
        if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
          callbacks.current.handleError(error);
          setStatus("error");
          return;
        }
        if (error instanceof ApiError && error.statusCode === 400) {
          setFieldError(error.fields?.q ?? "Check the search text.");
          setStatus("error");
          return;
        }
        setFieldError(null);
        setStatus("error");
      }
    },
    [boardId],
  );

  const setQuery = useCallback(
    (text: string) => {
      setQueryText(text);
      const trimmed = text.trim();
      if (trimmed === "") {
        // A blank query clears the results and the loading state at once (S6, Q3).
        cancel();
        lastQueryRef.current = null;
        setHeld(null);
        setFieldError(null);
        setStatus("idle");
        return;
      }
      if (trimmed === lastQueryRef.current) return; // the normalized text did not change
      cancel();
      lastQueryRef.current = trimmed;
      setHeld(null);
      setFieldError(null);
      setStatus("loading");
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void run(trimmed);
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancel, run],
  );

  const retry = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed === "") return;
    cancel();
    setHeld(null);
    setFieldError(null);
    setStatus("loading");
    void run(trimmed);
  }, [cancel, query, run]);

  // Unmount: stop the timer and abort the request (FE-A2).
  useEffect(() => cancel, [cancel]);

  return { query, setQuery, status, held, fieldError, retry };
}
