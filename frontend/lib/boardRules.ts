// Field rules for the board name (E06, E08) and the member email (E11). They mirror the Flask
// boards schema and the shared validators in backend/app/validation.py (design "Request rules").
// The email rule is the auth rule, re-exported so both forms share one definition (FE-A1, Requirements 1.8, 4.6).
// Lengths count Unicode code points, so there are no minLength or maxLength attributes.

import {
  codePointLength,
  EMAIL_MAX,
  EMAIL_PATTERN,
  MESSAGES as AUTH_MESSAGES,
  normalizeEmail,
} from "./authRules";

export { EMAIL_MAX, EMAIL_PATTERN, normalizeEmail } from "./authRules";

export const BOARD_NAME_MAX = 100;

export const BOARD_MESSAGES = {
  required: "Required.",
  notText: "Must be text.",
  unknown: "Unknown field.",
  nameLength: `Must be 1 to ${BOARD_NAME_MAX} characters.`,
} as const;

export const SPRINT_MAX_DAYS = 90;

export const SPRINT_MESSAGES = {
  invalidDate: "Enter a valid date.",
  bothDates: "Enter both sprint dates.",
  endBeforeStart: "Must be on or after the start date.",
  tooLong: `Must be at most ${SPRINT_MAX_DAYS} days long.`,
} as const;

export type SprintRange = { sprint_start: string; sprint_end: string };
export type SprintErrors = { sprint_start?: string; sprint_end?: string };
/** `sprint: null` means no sprint (both dates empty): omit it on create, clear it on update. */
export type SprintResult =
  | { ok: true; sprint: SprintRange | null }
  | { ok: false; errors: SprintErrors };

export type BoardNameResult =
  | { ok: true; name: string }
  | { ok: false; error: string };
export type MemberEmailResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

/** Trims the name. Only leading and trailing whitespace is removed. */
export function normalizeBoardName(value: string): string {
  return value.trim();
}

/** Accepts a trimmed name of 1 to 100 code points. Duplicate names are allowed (Requirement 1.9). */
export function validateBoardName(raw: unknown): BoardNameResult {
  if (raw === undefined || raw === null)
    return { ok: false, error: BOARD_MESSAGES.required };
  if (typeof raw !== "string")
    return { ok: false, error: BOARD_MESSAGES.notText };
  // An empty or blank value is present, so it gets the length message, as in the Flask schema.
  const name = normalizeBoardName(raw);
  const length = codePointLength(name);
  if (length < 1 || length > BOARD_NAME_MAX)
    return { ok: false, error: BOARD_MESSAGES.nameLength };
  return { ok: true, name };
}

/** Trims and lowercases the email, then applies the same length and format rules as registration. */
export function validateMemberEmail(raw: unknown): MemberEmailResult {
  if (raw === undefined || raw === null)
    return { ok: false, error: AUTH_MESSAGES.required };
  if (typeof raw !== "string")
    return { ok: false, error: AUTH_MESSAGES.notText };
  // An empty or blank value is present, so it fails the format check, as in register and the Flask schema.
  const email = normalizeEmail(raw);
  if (codePointLength(email) > EMAIL_MAX)
    return { ok: false, error: AUTH_MESSAGES.emailLength };
  if (!EMAIL_PATTERN.test(email))
    return { ok: false, error: AUTH_MESSAGES.emailFormat };
  return { ok: true, email };
}

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * The day number (days since 1970-01-01, UTC) of a real `YYYY-MM-DD` date, or null. Uses UTC only,
 * so a daylight saving change cannot move a day. Year 0000 is rejected, like the Flask rule.
 */
export function sprintDayNumber(value: unknown): number | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;
  return Math.round(date.getTime() / DAY_MS);
}

/**
 * Checks the optional sprint pair as the Flask schema does (Requirement 8.3 to 8.5). `null` and
 * `undefined` both mean "not set". A form passes `value || null` so an empty input is not set. Each
 * date is checked alone first. The pair rule runs only when both dates are valid, so each message
 * names one cause (design DS6).
 */
export function validateSprint(startRaw: unknown, endRaw: unknown): SprintResult {
  const start = startRaw ?? null;
  const end = endRaw ?? null;
  const errors: SprintErrors = {};
  if (start !== null && sprintDayNumber(start) === null) errors.sprint_start = SPRINT_MESSAGES.invalidDate;
  if (end !== null && sprintDayNumber(end) === null) errors.sprint_end = SPRINT_MESSAGES.invalidDate;
  if (errors.sprint_start || errors.sprint_end) return { ok: false, errors };

  if (start === null && end === null) return { ok: true, sprint: null };
  if (start === null) return { ok: false, errors: { sprint_start: SPRINT_MESSAGES.bothDates } };
  if (end === null) return { ok: false, errors: { sprint_end: SPRINT_MESSAGES.bothDates } };

  const days = (sprintDayNumber(end) as number) - (sprintDayNumber(start) as number);
  if (days < 0) return { ok: false, errors: { sprint_end: SPRINT_MESSAGES.endBeforeStart } };
  if (days >= SPRINT_MAX_DAYS) return { ok: false, errors: { sprint_end: SPRINT_MESSAGES.tooLong } };
  return { ok: true, sprint: { sprint_start: start as string, sprint_end: end as string } };
}
