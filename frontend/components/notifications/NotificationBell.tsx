"use client";

import { useState } from "react";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { BaseBadge } from "@/components/shared/BaseBadge";
import { useNotifications } from "@/hooks/useNotifications";
import { badgeText, bellLabel } from "@/lib/notifications";
import type { NotificationItem } from "@/lib/types";

// The bell in the AppHeader (Requirements 6.1 to 6.4, 7.1, 7.4; design "NotificationBell"). It owns
// the open state and the hook. The badge is hidden at 0 and before the first response, and caps at
// `99+`. The accessible name keeps the exact count, so the badge is hidden from assistive technology
// (FE-S3, B10). Following a row's link marks it read without waiting and without stopping the
// navigation (B8).
export function NotificationBell() {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const { unread } = notifications;
  const badge = unread === null ? "" : badgeText(unread);

  function openPanel() {
    setOpen(true);
    notifications.open();
  }

  function closePanel() {
    setOpen(false);
    notifications.close();
  }

  function follow(item: NotificationItem) {
    // Not awaited and never prevented: the router navigates at once, and a failure stays quiet.
    if (item.read_at === null) void notifications.markRead(item.id, { quiet: true });
    closePanel();
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={bellLabel(unread ?? 0)}
        onClick={openPanel}
        className="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-field text-neutral-content hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" strokeLinejoin="round" />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {badge ? (
          <span aria-hidden="true" className="absolute -right-0.5 top-0">
            <BaseBadge variant="primary" className="badge-sm min-w-5 px-1 tabular-nums">
              {badge}
            </BaseBadge>
          </span>
        ) : null}
      </button>
      <NotificationPanel
        open={open}
        onClose={closePanel}
        items={notifications.items}
        page={notifications.page}
        pageCount={notifications.pageCount}
        total={notifications.total}
        unread={unread}
        status={notifications.status}
        markingId={notifications.markingId}
        rowNotice={notifications.rowNotice}
        announcement={notifications.announcement}
        onRetry={notifications.retry}
        onPage={notifications.goToPage}
        onMark={(id) => void notifications.markRead(id)}
        onFollow={follow}
      />
    </>
  );
}
