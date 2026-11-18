import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { analyticsPath, barPercent, formatWeekRange, parseAnalytics } from "./analytics";

// E29 parser, week text and bar helpers (task 3.1; Requirements 6.2, 8.2; Property 13).

const VALID = {
  week_start: "2026-11-09T00:00:00Z",
  week_end: "2026-11-16T00:00:00Z",
  window: "week",
  cards_per_column: [
    { column_id: "c1", name: "To do", count: 3 },
    { column_id: "c2", name: "Done", count: 0 },
  ],
  completed_cards: 4,
  member_activity: [{ user_id: "u1", name: "Ana", count: 9 }],
};

describe("analyticsPath", () => {
  it("has no query string", () => {
    expect(analyticsPath("b-1")).toBe("/api/boards/b-1/analytics");
  });
});

describe("parseAnalytics", () => {
  it("accepts a valid result and an empty one", () => {
    expect(parseAnalytics(VALID)).toEqual(VALID);
    const empty = { ...VALID, cards_per_column: [], completed_cards: 0, member_activity: [] };
    expect(parseAnalytics(empty)).toEqual(empty);
  });

  it("accepts both window kinds (C40)", () => {
    expect(parseAnalytics({ ...VALID, window: "sprint" }).window).toBe("sprint");
    expect(parseAnalytics({ ...VALID, window: "week" }).window).toBe("week");
  });

  it.each([["a missing window", { ...VALID, window: undefined }], ["an unknown window", { ...VALID, window: "month" }], ["a non-string window", { ...VALID, window: 1 }]])(
    "rejects %s",
    (_label, value) => {
      expect(() => parseAnalytics(value)).toThrow(ApiError);
    },
  );

  it("copies only the documented fields", () => {
    const noisy = {
      ...VALID,
      email: "x@y.z",
      cards_per_column: [{ column_id: "c1", name: "A", count: 1, secret: "s" }],
      member_activity: [{ user_id: "u", name: "N", count: 1, email: "e" }],
    };
    const parsed = parseAnalytics(noisy);
    expect(Object.keys(parsed).sort()).toEqual(
      ["cards_per_column", "completed_cards", "member_activity", "week_end", "week_start", "window"],
    );
    expect(parsed.cards_per_column[0]).toEqual({ column_id: "c1", name: "A", count: 1 });
    expect(parsed.member_activity[0]).toEqual({ user_id: "u", name: "N", count: 1 });
  });

  it.each([
    ["a non-object", "text"],
    ["null", null],
    ["an array", []],
    ["a missing key", { ...VALID, completed_cards: undefined }],
    ["a week_start without Z", { ...VALID, week_start: "2026-11-09T00:00:00+00:00" }],
    ["a week_end that is not a date", { ...VALID, week_end: "soonZ" }],
    ["a negative completed count", { ...VALID, completed_cards: -1 }],
    ["a fractional completed count", { ...VALID, completed_cards: 1.5 }],
    ["a string completed count", { ...VALID, completed_cards: "4" }],
    ["a count beyond the safe range", { ...VALID, completed_cards: 2 ** 60 }],
    ["a column count that is negative", { ...VALID, cards_per_column: [{ column_id: "c", name: "n", count: -2 }] }],
    ["a column item without a name", { ...VALID, cards_per_column: [{ column_id: "c", count: 1 }] }],
    ["an activity item without a user_id", { ...VALID, member_activity: [{ name: "n", count: 1 }] }],
    ["an activity count as a string", { ...VALID, member_activity: [{ user_id: "u", name: "n", count: "1" }] }],
    ["a list that is not an array", { ...VALID, member_activity: {} }],
  ])("rejects %s with an ApiError", (_label, value) => {
    expect(() => parseAnalytics(value)).toThrow(ApiError);
  });
});

describe("formatWeekRange", () => {
  // The test zone is Asia/Jakarta, UTC+07:00 (vitest.config.mts).
  it("shows both bounds in local time", () => {
    expect(formatWeekRange("2026-11-09T00:00:00Z", "2026-11-16T00:00:00Z")).toBe(
      "Week of 9 Nov, 07:00 to 16 Nov, 07:00 (local time)",
    );
  });

  it("moves the date when the offset crosses midnight", () => {
    expect(formatWeekRange("2026-11-30T20:00:00Z", "2026-12-07T20:00:00Z")).toBe(
      "Week of 1 Dec, 03:00 to 8 Dec, 03:00 (local time)",
    );
  });

  it("crosses a year", () => {
    expect(formatWeekRange("2026-12-28T00:00:00Z", "2027-01-04T00:00:00Z")).toBe(
      "Week of 28 Dec, 07:00 to 4 Jan, 07:00 (local time)",
    );
  });
});

describe("barPercent", () => {
  it("handles zero, an empty comparison, the maximum and a fraction", () => {
    expect(barPercent(0, 5)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
    expect(barPercent(5, 5)).toBe(100);
    expect(barPercent(1, 3)).toBe(33);
    expect(barPercent(9, 5)).toBe(100);
  });
});
