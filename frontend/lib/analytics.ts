import { malformedApiError } from "./errors";
import type { ActivityCount, BoardAnalytics, ColumnCount } from "./types";

// Board analytics helpers shared by the hook and the components (design "lib/analytics.ts").

/** The declared same-origin path for one read. It carries no query string (Requirement 8.1). */
export function analyticsPath(boardId: string): string {
  return `/api/boards/${boardId}/analytics`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isUtcTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.endsWith("Z") && !Number.isNaN(Date.parse(value));
}

function parseColumnCount(item: unknown): ColumnCount {
  if (
    !isRecord(item) ||
    typeof item.column_id !== "string" ||
    typeof item.name !== "string" ||
    !isCount(item.count)
  ) {
    throw malformedApiError();
  }
  return { column_id: item.column_id, name: item.name, count: item.count };
}

function parseActivityCount(item: unknown): ActivityCount {
  if (
    !isRecord(item) ||
    typeof item.user_id !== "string" ||
    typeof item.name !== "string" ||
    !isCount(item.count)
  ) {
    throw malformedApiError();
  }
  return { user_id: item.user_id, name: item.name, count: item.count };
}

/** E29 allowlist: copies the six documented keys and throws ApiError on any other shape. */
export function parseAnalytics(value: unknown): BoardAnalytics {
  if (
    !isRecord(value) ||
    !isUtcTimestamp(value.week_start) ||
    !isUtcTimestamp(value.week_end) ||
    (value.window !== "sprint" && value.window !== "week") ||
    !isCount(value.completed_cards) ||
    !Array.isArray(value.cards_per_column) ||
    !Array.isArray(value.member_activity)
  ) {
    throw malformedApiError();
  }
  return {
    week_start: value.week_start,
    week_end: value.week_end,
    window: value.window,
    cards_per_column: value.cards_per_column.map(parseColumnCount),
    completed_cards: value.completed_cards,
    member_activity: value.member_activity.map(parseActivityCount),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function localStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * "Week of 9 Nov, 07:00 to 16 Nov, 07:00 (local time)". The server's Week stays the UTC week (A2);
 * only its two bounds are shown in the viewer's time zone. The end is exclusive, so it is shown as
 * is. A fixed month list keeps the text the same in every locale.
 */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  return `Week of ${localStamp(new Date(weekStart))} to ${localStamp(new Date(weekEnd))} (local time)`;
}

/** A whole percent from 0 to 100 for a decorative bar. 0 when there is nothing to compare. */
export function barPercent(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.min(100, Math.round((count / max) * 100));
}
