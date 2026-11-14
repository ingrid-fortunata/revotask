import { malformedApiError } from "./errors";
import type { NotificationItem, NotificationKind, NotificationPage } from "./types";

// Helpers and allowlist parsers for the notification payloads (E27, E28; Requirement 10.3, FE-A1).
// A parser copies only the documented fields and throws ApiError on any other shape, so an extra
// key from upstream never reaches a component.

export const NOTIFICATIONS_PER_PAGE = 20;
export const POLL_INTERVAL_MS = 30_000;

/** The E27 request path for one page. It is the only shape the client allowlist accepts. */
export function notificationsPath(page: number): string {
  return `/api/notifications?page=${page}&per_page=${NOTIFICATIONS_PER_PAGE}`;
}

/** The E28 request path. */
export function notificationReadPath(id: string): string {
  return `/api/notifications/${id}/read`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isKind(value: unknown): value is NotificationKind {
  return value === "assigned" || value === "commented";
}

export function parseNotification(value: unknown): NotificationItem {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isKind(value.kind) ||
    typeof value.board_id !== "string" ||
    typeof value.card_id !== "string" ||
    typeof value.actor_id !== "string" ||
    typeof value.actor_name !== "string" ||
    typeof value.board_name !== "string" ||
    typeof value.card_title !== "string" ||
    !isIsoDate(value.created_at) ||
    !(value.read_at === null || isIsoDate(value.read_at))
  ) {
    throw malformedApiError();
  }
  return {
    id: value.id,
    kind: value.kind,
    board_id: value.board_id,
    card_id: value.card_id,
    actor_id: value.actor_id,
    actor_name: value.actor_name,
    board_name: value.board_name,
    card_title: value.card_title,
    created_at: value.created_at,
    read_at: value.read_at,
  };
}

/** E27: one page of items with the page, size and both counts. */
export function parseNotificationPage(value: unknown): NotificationPage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !isCount(value.page) ||
    !isCount(value.per_page) ||
    !isCount(value.total) ||
    !isCount(value.unread_count)
  ) {
    throw malformedApiError();
  }
  return {
    items: value.items.map(parseNotification),
    page: value.page,
    per_page: value.per_page,
    total: value.total,
    unread_count: value.unread_count,
  };
}

/** One plain sentence for a row. It is rendered as a text node, so markup shows as literal text. */
export function notificationText(item: Pick<NotificationItem, "kind" | "actor_name" | "card_title">): string {
  return item.kind === "assigned"
    ? `${item.actor_name} assigned you to ${item.card_title}`
    : `${item.actor_name} commented on ${item.card_title}`;
}

/** The visual badge: empty at 0, the number up to 99, then `99+` (B10). */
export function badgeText(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

/** The bell's accessible name. It always carries the exact count (FE-S3, B10). */
export function bellLabel(count: number): string {
  return count > 0 ? `Notifications, ${count} unread` : "Notifications";
}

/** The number of pages for a total at 20 per page. At least one, so "Page 1 of 1" is valid. */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / NOTIFICATIONS_PER_PAGE));
}
