"use client";

import { useEffect, useRef, useState } from "react";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { isForbiddenError, isUncertainOutcome } from "@/lib/boardErrors";
import { parseComment, parseCommentList } from "@/lib/comments";
import { ApiError } from "@/lib/errors";
import { notifyError } from "@/lib/toast";
import type { Comment } from "@/lib/types";

export type CommentsStatus = "loading" | "ready" | "error";

/** The add form's state after an uncertain outcome (design DD15). */
export type AddState = "idle" | "checking" | "review" | "refresh-failed";

/** What the board refetch says about a 404 (design DD10). */
export type NotFoundResolution = "card-present" | "card-gone" | "access-lost" | "unknown";

export type CommentWrite =
  | { ok: true }
  | { ok: false; handled: boolean; uncertain?: boolean; fields?: Record<string, string> };

export type CommentNotice = { text: string; retry: boolean };

export interface UseCardCommentsOptions {
  cardId: string;
  /** Refetches the board and reports whether the card, the board or neither is still reachable. */
  resolveNotFound: () => Promise<NotFoundResolution>;
  /** Called when the card is gone, so the modal can close. */
  onCardGone: () => void;
}

export const COMMENT_MESSAGES = {
  loadFailed: "Comments could not be loaded.",
  refreshFailed: "Comments could not be refreshed.",
  cardGone: "That card no longer exists.",
  commentGone: "That comment no longer exists.",
  notAuthor: "Only the author can change a comment.",
  notSaved: "Your comment was not saved. Try again.",
  notDeleted: "The comment was not deleted. Try again.",
  checking: "We could not confirm that your comment was posted. Checking the list.",
  review: "Your comment may have been posted. Check the list, then use Add comment to try again.",
  refreshNeeded: "Your comment may have been posted. Refresh the comments to check before you try again.",
  added: "Comment added.",
  saved: "Comment saved.",
  deleted: "Comment deleted.",
} as const;

type ListOutcome = "ok" | "stale" | "not-found" | "failed" | "handled";
type WriteKind = "add" | "edit" | "remove";

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

// Comment state for the card detail modal (Requirements 6.3, 6.6, 6.7, 7.1 to 7.3, 7.7, 7.8,
// 7.11, 7.12; design DD10 to DD12 and DD15). One write runs at a time. The modal body is keyed by
// card ID, so closing it or opening another card unmounts the hook, and every response after that
// is dropped. A comment write never touches the board gate (M12).
export function useCardComments({ cardId, resolveNotFound, onCardGone }: UseCardCommentsOptions) {
  const { handleError } = useErrorHandler();
  const [comments, setComments] = useState<Comment[]>([]);
  const [status, setStatus] = useState<CommentsStatus>("loading");
  const [pending, setPendingState] = useState(false);
  const [addState, setAddStateValue] = useState<AddState>("idle");
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState<CommentNotice | null>(null);

  const mountedRef = useRef(true);
  const writeRef = useRef(false);
  const addStateRef = useRef<AddState>("idle");
  const loadRef = useRef<AbortController | null>(null);
  const callbacks = useRef({ resolveNotFound, onCardGone });

  // Keep the latest callbacks for the async work below without making it depend on them.
  useEffect(() => {
    callbacks.current = { resolveNotFound, onCardGone };
  });

  function setPending(next: boolean) {
    writeRef.current = next;
    if (mountedRef.current) setPendingState(next);
  }

  function setAddState(next: AddState) {
    addStateRef.current = next;
    if (mountedRef.current) setAddStateValue(next);
  }

  function announce(text: string) {
    if (mountedRef.current) setAnnouncement(text);
  }

  // Reads E23 and applies the list. `ok` means the list was replaced. A 404 is not handled here.
  async function fetchList(): Promise<ListOutcome> {
    loadRef.current?.abort();
    const controller = new AbortController();
    loadRef.current = controller;
    try {
      const list = parseCommentList(await apiGet<unknown>(`/api/cards/${cardId}/comments`, controller.signal));
      if (!mountedRef.current || controller.signal.aborted) return "stale";
      setComments(list);
      return "ok";
    } catch (error) {
      if (isAbort(error) || !mountedRef.current || controller.signal.aborted) return "stale";
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
        handleError(error);
        return "handled";
      }
      if (error instanceof ApiError && error.statusCode === 404) return "not-found";
      return "failed";
    }
  }

  // A 404 is the same for a missing comment, a missing card and lost access, so the board refetch
  // decides (DD10). The reload that follows is not resolved again, so a second 404 cannot loop.
  async function resolveNotFoundAndReload(): Promise<"reloaded" | "stopped"> {
    const resolution = await callbacks.current.resolveNotFound();
    if (!mountedRef.current) return "stopped";
    if (resolution === "access-lost") return "stopped"; // the board hook is already redirecting
    if (resolution === "card-gone") {
      notifyError(COMMENT_MESSAGES.cardGone);
      callbacks.current.onCardGone();
      return "stopped";
    }
    if (resolution === "unknown") {
      setNotice({ text: COMMENT_MESSAGES.refreshFailed, retry: true });
      return "stopped";
    }
    const outcome = await fetchList();
    if (!mountedRef.current) return "stopped";
    if (outcome === "ok") {
      setStatus("ready");
      return "reloaded";
    }
    if (outcome === "not-found" || outcome === "failed") {
      setNotice({ text: COMMENT_MESSAGES.refreshFailed, retry: true });
    }
    return "stopped";
  }

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const outcome = await fetchList();
      if (!mountedRef.current) return;
      if (outcome === "ok") setStatus("ready");
      else if (outcome === "failed" || outcome === "handled") setStatus("error");
      else if (outcome === "not-found") {
        const result = await resolveNotFoundAndReload();
        if (mountedRef.current && result === "stopped") setStatus("error");
      }
    })();
    return () => {
      mountedRef.current = false;
      loadRef.current?.abort();
    };
    // The body is keyed by card ID, so this runs once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  /** Retry for the load error, the refresh notice, and Refresh comments after an uncertain add. */
  async function reload(): Promise<void> {
    if (writeRef.current || !mountedRef.current) return;
    setPending(true);
    setNotice(null);
    const listWasShown = status === "ready";
    if (!listWasShown) setStatus("loading");
    let outcome = await fetchList();
    if (!mountedRef.current) return;
    if (outcome === "not-found") {
      const result = await resolveNotFoundAndReload();
      if (!mountedRef.current) return;
      outcome = result === "reloaded" ? "ok" : "failed";
    }
    if (outcome === "ok") {
      setStatus("ready");
      if (addStateRef.current === "refresh-failed") {
        setAddState("review");
        announce(COMMENT_MESSAGES.review);
      }
    } else if (outcome === "failed") {
      if (!listWasShown) setStatus("error");
      else setNotice((current) => current ?? { text: COMMENT_MESSAGES.refreshFailed, retry: true });
    } else if (!listWasShown) {
      setStatus("error");
    }
    setPending(false);
  }

  // The add ended without a usable answer, so the comment may exist (N5). Keep the list visible,
  // refetch once, and enable a manual retry only after the refetch succeeds.
  async function checkAfterUncertainAdd(): Promise<void> {
    setAddState("checking");
    announce(COMMENT_MESSAGES.checking);
    let outcome = await fetchList();
    if (!mountedRef.current) return;
    if (outcome === "not-found") {
      const result = await resolveNotFoundAndReload();
      if (!mountedRef.current) return;
      outcome = result === "reloaded" ? "ok" : "failed";
    }
    if (outcome === "ok") {
      setAddState("review");
      announce(COMMENT_MESSAGES.review);
    } else {
      setAddState("refresh-failed");
      announce(COMMENT_MESSAGES.refreshNeeded);
    }
    setPending(false);
  }

  async function failWrite(kind: WriteKind, error: unknown, commentId?: string): Promise<CommentWrite> {
    if (!mountedRef.current) return { ok: false, handled: true };
    if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
      handleError(error);
      setPending(false);
      return { ok: false, handled: true };
    }
    if (error instanceof ApiError && error.statusCode === 400 && error.fields) {
      setPending(false);
      return { ok: false, handled: false, fields: error.fields };
    }
    if (kind === "add" && isUncertainOutcome(error)) {
      void checkAfterUncertainAdd();
      return { ok: false, handled: true, uncertain: true };
    }
    if (isForbiddenError(error)) {
      setNotice({ text: COMMENT_MESSAGES.notAuthor, retry: false });
      announce(COMMENT_MESSAGES.notAuthor);
      const outcome = await fetchList();
      if (outcome === "not-found") await resolveNotFoundAndReload();
      setPending(false);
      return { ok: false, handled: true };
    }
    if (error instanceof ApiError && error.statusCode === 404) {
      const result = await resolveNotFoundAndReload();
      if (mountedRef.current && result === "reloaded" && kind !== "add") {
        const gone = commentId ? COMMENT_MESSAGES.commentGone : COMMENT_MESSAGES.cardGone;
        setNotice({ text: gone, retry: false });
        announce(gone);
      }
      setPending(false);
      return { ok: false, handled: true };
    }
    const text = kind === "remove" ? COMMENT_MESSAGES.notDeleted : COMMENT_MESSAGES.notSaved;
    setNotice({ text, retry: false });
    announce(text);
    setPending(false);
    return { ok: false, handled: true, uncertain: true };
  }

  function blocked(kind: WriteKind): boolean {
    if (writeRef.current || !mountedRef.current) return true;
    return kind === "add" && (addStateRef.current === "checking" || addStateRef.current === "refresh-failed");
  }

  async function add(content: string): Promise<CommentWrite> {
    if (blocked("add")) return { ok: false, handled: true };
    setPending(true);
    setNotice(null);
    setAddState("idle");
    try {
      const created = parseComment(await apiRequest<unknown>("POST", `/api/cards/${cardId}/comments`, { content }));
      if (!mountedRef.current) return { ok: false, handled: true };
      setComments((current) => [...current, created]);
      announce(COMMENT_MESSAGES.added);
      setPending(false);
      return { ok: true };
    } catch (error) {
      return failWrite("add", error);
    }
  }

  async function edit(commentId: string, content: string): Promise<CommentWrite> {
    if (blocked("edit")) return { ok: false, handled: true };
    setPending(true);
    setNotice(null);
    try {
      const updated = parseComment(await apiRequest<unknown>("PATCH", `/api/comments/${commentId}`, { content }));
      if (!mountedRef.current) return { ok: false, handled: true };
      setComments((current) => current.map((item) => (item.id === commentId ? updated : item)));
      announce(COMMENT_MESSAGES.saved);
      setPending(false);
      return { ok: true };
    } catch (error) {
      return failWrite("edit", error, commentId);
    }
  }

  async function remove(commentId: string): Promise<CommentWrite> {
    if (blocked("remove")) return { ok: false, handled: true };
    setPending(true);
    setNotice(null);
    try {
      await apiRequest<unknown>("DELETE", `/api/comments/${commentId}`);
      if (!mountedRef.current) return { ok: false, handled: true };
      setComments((current) => current.filter((item) => item.id !== commentId));
      announce(COMMENT_MESSAGES.deleted);
      setPending(false);
      return { ok: true };
    } catch (error) {
      return failWrite("remove", error, commentId);
    }
  }

  return { comments, status, pending, addState, announcement, notice, reload, add, edit, remove };
}
