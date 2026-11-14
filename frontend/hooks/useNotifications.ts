"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiGet, apiRequest } from "@/lib/apiClient";
import { ApiError } from "@/lib/errors";
import {
  notificationReadPath,
  notificationsPath,
  pageCount,
  parseNotification,
  parseNotificationPage,
  POLL_INTERVAL_MS,
} from "@/lib/notifications";
import { notifyError } from "@/lib/toast";
import type { NotificationItem, NotificationPage } from "@/lib/types";

/** What the panel shows. The bell reads only `unread`. */
export type NotificationsStatus = "idle" | "loading" | "ready" | "error";

export const NOTIFICATION_MESSAGES = {
  markFailed: "The notification was not marked as read. Try again.",
  marked: "Marked as read.",
  gone: "That notification is no longer available. The list was refreshed.",
} as const;

export type RowNotice = { id: string; text: string };

// A request is "background" (the mount request and every Poll: a failure shows nothing) or
// "foreground" (the user opened the panel, changed the page, pressed Retry or marked a row: a
// failure shows an error with Retry). Requirements 7.8 and 8.6; design DD11.
type RequestKind = "background" | "foreground";

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

// Notification state for the bell and its panel (Requirements 7.5, 7.7 to 7.9, 7.12, 8.1 to 8.8;
// design DD9 to DD13). One timer is restarted by every E27 request, so the next Poll is 30 seconds
// after the last request began. `latestRef` guards every response: it grows with each new request,
// each completed mark and each page change, and a response applies only while its captured value
// is still current. That drops a response for an earlier page and one requested before a completed
// mark, and it covers an unmount. A tick is skipped while a request is in flight or a mark is pending.
export function useNotifications() {
  const { handleError } = useErrorHandler();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState<number | null>(null);
  const [status, setStatus] = useState<NotificationsStatus>("idle");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [rowNotice, setRowNotice] = useState<RowNotice | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const mountedRef = useRef(false);
  const stoppedRef = useRef(false);
  const latestRef = useRef(0);
  const pageRef = useRef(1);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const markPendingRef = useRef(false);
  const itemsRef = useRef<NotificationItem[]>([]);
  const tickRef = useRef<() => void>(() => {});
  // The last-page step calls `load` again, so it goes through a ref.
  const loadRef = useRef<(target: number, kind: RequestKind) => void>(() => {});
  const callbacks = useRef({ handleError });
  useEffect(() => {
    callbacks.current = { handleError };
    itemsRef.current = items;
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const schedule = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => tickRef.current(), POLL_INTERVAL_MS);
  }, [clearTimer]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearTimer();
    controllerRef.current?.abort();
    inFlightRef.current = false;
  }, [clearTimer]);

  const load = useCallback(
    (target: number, kind: RequestKind) => {
      if (!mountedRef.current || stoppedRef.current) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const token = ++latestRef.current;
      inFlightRef.current = true;
      schedule();

      const current = () =>
        mountedRef.current && token === latestRef.current && !controller.signal.aborted;

      apiGet<unknown>(notificationsPath(target), controller.signal)
        .then(parseNotificationPage)
        .then((data: NotificationPage) => {
          // A response for another page than the one now shown is dropped (Requirement 8.5).
          if (!current() || target !== pageRef.current) return;
          inFlightRef.current = false;
          setItems(data.items);
          setTotal(data.total);
          setUnread(data.unread_count);
          setPage(target);
          setStatus("ready");
          // The page emptied (its last rows went away): go to the last page that exists.
          const last = pageCount(data.total);
          if (data.items.length === 0 && data.total > 0 && target > last) {
            pageRef.current = last;
            setPage(last);
            loadRef.current(last, "foreground");
          }
        })
        .catch((error: unknown) => {
          // Superseded, aborted or unmounted: nothing to show, and the newer request owns the state.
          if (!current() || isAbort(error)) return;
          inFlightRef.current = false;
          if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
            stop();
            callbacks.current.handleError(error);
            return;
          }
          if (kind === "foreground") setStatus("error");
        });
    },
    [schedule, stop],
  );

  useEffect(() => {
    mountedRef.current = true;
    loadRef.current = load;
    tickRef.current = () => {
      if (!mountedRef.current || stoppedRef.current) return;
      // One E27 request at a time, and none while a mark is pending: skip this tick.
      if (inFlightRef.current || markPendingRef.current) {
        schedule();
        return;
      }
      load(pageRef.current, "background");
    };
    load(1, "background");
    return () => {
      mountedRef.current = false;
      clearTimer();
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [load, schedule, clearTimer]);

  const open = useCallback(() => {
    pageRef.current = 1;
    setPage(1);
    setRowNotice(null);
    setStatus("loading");
    load(1, "foreground");
  }, [load]);

  // The next Poll asks for page 1 again. The held rows stay until it answers.
  const close = useCallback(() => {
    pageRef.current = 1;
    setPage(1);
    setRowNotice(null);
  }, []);

  const goToPage = useCallback(
    (next: number) => {
      pageRef.current = next;
      setPage(next);
      setRowNotice(null);
      setStatus("loading");
      load(next, "foreground");
    },
    [load],
  );

  const retry = useCallback(() => {
    setStatus("loading");
    load(pageRef.current, "foreground");
  }, [load]);

  const markRead = useCallback(
    async (id: string, options: { quiet?: boolean } = {}) => {
      if (markPendingRef.current || !mountedRef.current) return;
      const wasUnread = itemsRef.current.find((item) => item.id === id)?.read_at === null;
      markPendingRef.current = true;
      setMarkingId(id);
      setRowNotice(null);
      try {
        const saved = parseNotification(await apiRequest<unknown>("PATCH", notificationReadPath(id)));
        if (!mountedRef.current) return;
        // A completed mark invalidates any E27 request in flight: abort it and send one refresh.
        latestRef.current += 1;
        controllerRef.current?.abort();
        inFlightRef.current = false;
        setItems((rows) => rows.map((row) => (row.id === id ? saved : row)));
        if (wasUnread) setUnread((count) => (count === null ? count : Math.max(0, count - 1)));
        setAnnouncement(NOTIFICATION_MESSAGES.marked);
        load(pageRef.current, "foreground");
      } catch (error) {
        if (!mountedRef.current) return;
        if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
          stop();
          callbacks.current.handleError(error);
        } else if (error instanceof ApiError && error.statusCode === 404) {
          // Hidden or gone: refresh, because the list is out of date.
          setAnnouncement(NOTIFICATION_MESSAGES.gone);
          load(pageRef.current, "foreground");
        } else {
          setAnnouncement(NOTIFICATION_MESSAGES.markFailed);
          // A link click already navigated away, so it does not interrupt the new page (B8).
          if (!options.quiet) {
            setRowNotice({ id, text: NOTIFICATION_MESSAGES.markFailed });
            notifyError(NOTIFICATION_MESSAGES.markFailed);
          }
        }
      } finally {
        markPendingRef.current = false;
        if (mountedRef.current) setMarkingId(null);
      }
    },
    [load, stop],
  );

  return {
    items,
    page,
    pageCount: pageCount(total),
    total,
    unread,
    status,
    markingId,
    rowNotice,
    announcement,
    open,
    close,
    goToPage,
    retry,
    markRead,
  };
}
