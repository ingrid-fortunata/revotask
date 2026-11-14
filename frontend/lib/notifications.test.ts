import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import {
  badgeText,
  bellLabel,
  notificationReadPath,
  notificationsPath,
  notificationText,
  pageCount,
  parseNotification,
  parseNotificationPage,
} from "./notifications";

const ID = "11111111-1111-4111-8111-111111111111";
const item = {
  id: ID,
  kind: "assigned",
  board_id: "b",
  card_id: "c",
  actor_id: "a",
  actor_name: "Ana",
  board_name: "Launch",
  card_title: "Fix login",
  created_at: "2026-11-14T02:29:08.475522+00:00",
  read_at: null,
};

describe("parseNotification", () => {
  it("accepts a valid item, read or unread", () => {
    expect(parseNotification(item)).toEqual(item);
    const read = { ...item, read_at: "2026-11-14T03:00:00+00:00" };
    expect(parseNotification(read).read_at).toBe(read.read_at);
  });

  it("copies only the documented fields", () => {
    const parsed = parseNotification({ ...item, secret: "x", recipient_id: "r" });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(item).sort());
  });

  it.each([
    ["a non-object", "text"],
    ["an array", []],
    ["a missing display field", { ...item, card_title: undefined }],
    ["an unknown kind", { ...item, kind: "mentioned" }],
    ["a bad date", { ...item, created_at: "yesterday" }],
    ["an undefined read_at", { ...item, read_at: undefined }],
    ["a numeric id", { ...item, id: 5 }],
  ])("rejects %s with an ApiError", (_label, value) => {
    expect(() => parseNotification(value)).toThrow(ApiError);
  });
});

describe("parseNotificationPage", () => {
  const page = { items: [item], page: 1, per_page: 20, total: 1, unread_count: 1 };

  it("accepts a page and an empty page", () => {
    expect(parseNotificationPage(page)).toEqual(page);
    expect(parseNotificationPage({ ...page, items: [], total: 0, unread_count: 0 }).items).toEqual([]);
  });

  it.each([
    ["no items array", { ...page, items: "x" }],
    ["a negative count", { ...page, unread_count: -1 }],
    ["a fractional total", { ...page, total: 1.5 }],
    ["a bad item", { ...page, items: [{ ...item, kind: "x" }] }],
    ["a missing page", { ...page, page: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseNotificationPage(value)).toThrow(ApiError);
  });
});

describe("text and labels", () => {
  it("writes one sentence for each kind", () => {
    expect(notificationText(item as never)).toBe("Ana assigned you to Fix login");
    expect(notificationText({ ...item, kind: "commented" } as never)).toBe("Ana commented on Fix login");
  });

  it.each([
    [0, ""],
    [1, "1"],
    [99, "99"],
    [100, "99+"],
    [1200, "99+"],
  ])("badgeText(%i) is %j", (count, text) => {
    expect(badgeText(count)).toBe(text);
  });

  it("keeps the exact count in the bell label", () => {
    expect(bellLabel(0)).toBe("Notifications");
    expect(bellLabel(3)).toBe("Notifications, 3 unread");
    expect(bellLabel(120)).toBe("Notifications, 120 unread");
  });

  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [21, 2],
    [45, 3],
  ])("pageCount(%i) is %i", (total, pages) => {
    expect(pageCount(total)).toBe(pages);
  });

  it("builds the two request paths", () => {
    expect(notificationsPath(3)).toBe("/api/notifications?page=3&per_page=20");
    expect(notificationReadPath(ID)).toBe(`/api/notifications/${ID}/read`);
  });
});
