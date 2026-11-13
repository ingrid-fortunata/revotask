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
