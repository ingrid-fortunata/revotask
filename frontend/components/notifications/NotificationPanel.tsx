"use client";

import { useId } from "react";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";
import type { NotificationsStatus, RowNotice } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/lib/types";

export interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  items: NotificationItem[];
  page: number;
  pageCount: number;
  total: number;
  unread: number | null;
  status: NotificationsStatus;
  markingId: string | null;
  rowNotice: RowNotice | null;
  announcement: string;
  onRetry: () => void;
  onPage: (page: number) => void;
  onMark: (id: string) => void;
  onFollow: (item: NotificationItem) => void;
}

// The notifications dialog (Requirements 7.1 to 7.11, 9.1 to 9.6; design "NotificationPanel"). A
// `BaseModal` gives the focus trap, Escape and the focus return. The list scrolls inside the dialog,
// so the close control stays reachable at 375 px. Props only: `useNotifications` owns the state.
export function NotificationPanel({
  open,
  onClose,
  items,
  page,
  pageCount,
  total,
  unread,
  status,
  markingId,
  rowNotice,
  announcement,
  onRetry,
  onPage,
  onMark,
  onFollow,
}: NotificationPanelProps) {
  const headingId = useId();
  const loading = status === "loading";
  return (
    <BaseModal open={open} onClose={onClose} labelledBy={headingId}>
      {/* The bell renders in the dark header, so the dialog would inherit its pale text color. */}
      <div className="text-base-content">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-semibold">
              Notifications
            </h2>
            <p className="text-sm tabular-nums text-base-content/70">
              {unread ?? 0} unread of {total}
            </p>
          </div>
          <BaseButton variant="ghost" onClick={onClose} aria-label="Close notifications">
            Close
          </BaseButton>
        </div>

        <div className="mt-2 max-h-[55dvh] overflow-y-auto">
          {loading ? (
            <p role="status" className="py-6 text-center text-sm text-base-content/70">
              Loading notifications…
            </p>
          ) : items.length > 0 ? (
            <ul className="divide-y divide-base-300">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  marking={markingId === item.id}
                  disabled={markingId !== null}
                  notice={rowNotice?.id === item.id ? rowNotice.text : undefined}
                  onMark={onMark}
                  onFollow={onFollow}
                />
              ))}
            </ul>
          ) : status === "ready" ? (
            <div className="py-6 text-center">
              <p className="font-medium">You have no notifications.</p>
              <p className="mt-1 text-sm text-base-content/70">
                You get one when someone assigns you a card or comments on a card assigned to you.
              </p>
            </div>
          ) : null}
          {status === "error" ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 py-3">
              <p className="min-w-0 flex-1 text-sm text-error">Notifications could not be loaded.</p>
              <BaseButton variant="ghost" onClick={onRetry}>
                Retry
              </BaseButton>
            </div>
          ) : null}
        </div>

        {pageCount > 1 && !loading ? (
          <nav aria-label="Notification pages" className="mt-2 flex items-center justify-between gap-2 border-t border-base-300 pt-3">
            <BaseButton variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              Newer
            </BaseButton>
            <span className="text-sm tabular-nums text-base-content/70">
              Page {page} of {pageCount}
            </span>
            <BaseButton variant="ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
              Older
            </BaseButton>
          </nav>
        ) : null}

        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      </div>
    </BaseModal>
  );
}
