import { describe, expect, it } from "vitest";
import { formatSprintRange, sprintFromWindow } from "./sprint";

// Display helpers for the sprint (Requirements 8.12, 9.6; design DS9). The clock is passed in.
const NOV_2026 = new Date("2026-11-18T10:00:00Z");

describe("formatSprintRange", () => {
  it("shows day and month in the current year, with no time", () => {
    expect(formatSprintRange("2026-11-16", "2026-11-22", NOV_2026)).toBe("Sprint 16 Nov to 22 Nov");
  });

  it("shows a one-day sprint as a range of the same day", () => {
    expect(formatSprintRange("2026-11-18", "2026-11-18", NOV_2026)).toBe("Sprint 18 Nov to 18 Nov");
  });

  it("adds the year to both dates when the range crosses into another year", () => {
    expect(formatSprintRange("2026-12-28", "2027-01-03", NOV_2026)).toBe(
      "Sprint 28 Dec 2026 to 3 Jan 2027",
    );
  });

  it("adds the year when the range is not in the current year", () => {
    expect(formatSprintRange("2025-03-03", "2025-03-09", NOV_2026)).toBe(
      "Sprint 3 Mar 2025 to 9 Mar 2025",
    );
  });

  it("uses the UTC year, so a local midnight cannot flip the text", () => {
    const newYearUtc = new Date("2027-01-01T00:00:00Z");
    expect(formatSprintRange("2027-01-04", "2027-01-10", newYearUtc)).toBe("Sprint 4 Jan to 10 Jan");
  });

  it("does not depend on the viewer's time zone", () => {
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    try {
      expect(formatSprintRange("2026-11-16", "2026-11-22", NOV_2026)).toBe("Sprint 16 Nov to 22 Nov");
    } finally {
      process.env.TZ = original;
    }
  });

  it("writes a leap day", () => {
    expect(formatSprintRange("2028-02-28", "2028-03-01", new Date("2028-02-01T00:00:00Z"))).toBe(
      "Sprint 28 Feb to 1 Mar",
    );
  });
});

describe("sprintFromWindow", () => {
  it("returns the sprint dates behind an E29 window: the end is the day before week_end", () => {
    expect(sprintFromWindow("2026-11-16T00:00:00Z", "2026-11-23T00:00:00Z")).toEqual({
      start: "2026-11-16",
      end: "2026-11-22",
    });
  });

  it("handles a one-day window, a month end, a year end and a leap day", () => {
    expect(sprintFromWindow("2026-11-18T00:00:00Z", "2026-11-19T00:00:00Z")).toEqual({
      start: "2026-11-18",
      end: "2026-11-18",
    });
    expect(sprintFromWindow("2026-11-30T00:00:00Z", "2026-12-02T00:00:00Z").end).toBe("2026-12-01");
    expect(sprintFromWindow("2026-12-30T00:00:00Z", "2027-01-03T00:00:00Z").end).toBe("2027-01-02");
    expect(sprintFromWindow("2028-02-27T00:00:00Z", "2028-03-02T00:00:00Z").end).toBe("2028-03-01");
  });

  it("round-trips with formatSprintRange for the example in the request", () => {
    const { start, end } = sprintFromWindow("2026-11-16T00:00:00Z", "2026-11-23T00:00:00Z");
    expect(formatSprintRange(start, end, NOV_2026)).toBe("Sprint 16 Nov to 22 Nov");
  });
});
