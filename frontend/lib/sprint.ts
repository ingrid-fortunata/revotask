// Display helpers for a board's sprint (design DS9). Dates are calendar dates (`YYYY-MM-DD`) and are
// shown as they are, with no time and no time zone conversion. A fixed month list keeps the text
// the same in every locale.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

function part(date: string): string {
  const year = date.slice(0, 4);
  const month = MONTHS[Number(date.slice(5, 7)) - 1];
  return `${Number(date.slice(8, 10))} ${month}|${year}`;
}

/**
 * "Sprint 16 Nov to 22 Nov". The year is added to both dates when either one is not in the current
 * UTC year: "Sprint 28 Dec 2026 to 3 Jan 2027". The year is for reading only, never for logic.
 */
export function formatSprintRange(start: string, end: string, now: Date = new Date()): string {
  const [startText, startYear] = part(start).split("|");
  const [endText, endYear] = part(end).split("|");
  const current = String(now.getUTCFullYear());
  const withYear = startYear !== current || endYear !== current;
  return withYear
    ? `Sprint ${startText} ${startYear} to ${endText} ${endYear}`
    : `Sprint ${startText} to ${endText}`;
}

/**
 * The two sprint dates behind an E29 window. `week_end` is exclusive, so the sprint ends the day
 * before it. Both bounds are UTC midnight, so the dates are read from the ISO text.
 */
export function sprintFromWindow(weekStart: string, weekEnd: string): { start: string; end: string } {
  return {
    start: weekStart.slice(0, 10),
    end: new Date(Date.parse(weekEnd) - DAY_MS).toISOString().slice(0, 10),
  };
}
