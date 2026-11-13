// Field rules for column names (E13, E14), card titles and descriptions (E17, E18). They mirror
// the Flask schemas in backend/app/blueprints/columns/schema.py and cards/schema.py and the shared
// cases in specs/fixtures/kanban-field-cases.json (Requirements 1.2, 3.4, 3.12). Lengths count
// Unicode code points, so the inputs carry no maxLength attribute (FormField).

import { codePointLength } from "./authRules";

export const COLUMN_NAME_MAX = 80;
export const CARD_TITLE_MAX = 160;
export const DESCRIPTION_MAX = 2000;

export const KANBAN_MESSAGES = {
  required: "Required.",
  notText: "Must be text.",
  columnName: `Must be 1 to ${COLUMN_NAME_MAX} characters.`,
  cardTitle: `Must be 1 to ${CARD_TITLE_MAX} characters.`,
  description: `Must be at most ${DESCRIPTION_MAX} characters.`,
} as const;

export type TextResult = { ok: true; value: string } | { ok: false; error: string };
export type DescriptionResult = { ok: true; value: string | null } | { ok: false; error: string };

function trimmedText(raw: unknown, min: number, max: number, message: string): TextResult {
  if (raw === undefined || raw === null) return { ok: false, error: KANBAN_MESSAGES.required };
  if (typeof raw !== "string") return { ok: false, error: KANBAN_MESSAGES.notText };
  const value = raw.trim();
  const length = codePointLength(value);
  if (length < min || length > max) return { ok: false, error: message };
  return { ok: true, value };
}

/** A trimmed column name of 1 to 80 code points. */
export function validateColumnName(raw: unknown): TextResult {
  return trimmedText(raw, 1, COLUMN_NAME_MAX, KANBAN_MESSAGES.columnName);
}

/** A trimmed card title of 1 to 160 code points. */
export function validateCardTitle(raw: unknown): TextResult {
  return trimmedText(raw, 1, CARD_TITLE_MAX, KANBAN_MESSAGES.cardTitle);
}

/** A trimmed description of at most 2,000 code points. Blank, whitespace and null become null. */
export function validateDescription(raw: unknown): DescriptionResult {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: KANBAN_MESSAGES.notText };
  const value = raw.trim();
  if (codePointLength(value) > DESCRIPTION_MAX) {
    return { ok: false, error: KANBAN_MESSAGES.description };
  }
  return { ok: true, value: value === "" ? null : value };
}
