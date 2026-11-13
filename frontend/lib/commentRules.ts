// Field rule for comment content (E24, E25). It mirrors the Flask schema in
// backend/app/blueprints/comments/schema.py and the shared cases in
// specs/fixtures/comment-field-cases.json (Requirements 2.2, 3.3). Content is trimmed, keeps its
// inner line breaks, and counts Unicode code points, so the field carries no maxLength attribute.

import { codePointLength } from "./authRules";

export const COMMENT_MAX = 2000;

export const COMMENT_MESSAGES = {
  required: "Required.",
  notText: "Must be text.",
  content: `Must be 1 to ${COMMENT_MAX} characters.`,
} as const;

export type CommentContentResult = { ok: true; value: string } | { ok: false; error: string };

/** Trimmed comment text of 1 to 2,000 code points. Inner line breaks are kept. */
export function validateCommentContent(raw: unknown): CommentContentResult {
  if (raw === undefined || raw === null) return { ok: false, error: COMMENT_MESSAGES.required };
  if (typeof raw !== "string") return { ok: false, error: COMMENT_MESSAGES.notText };
  const value = raw.trim();
  const length = codePointLength(value);
  if (length < 1 || length > COMMENT_MAX) return { ok: false, error: COMMENT_MESSAGES.content };
  return { ok: true, value };
}
