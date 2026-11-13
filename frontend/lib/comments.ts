import { malformedApiError } from "./errors";
import type { Comment } from "./types";

// Allowlist parsers for the comment payloads (E23 to E26; Requirement 9.3, FE-A1). The parser
// copies only the seven documented fields and throws ApiError on any other shape, so an extra key
// from upstream never reaches a component.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function parseComment(value: unknown): Comment {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.card_id !== "string" ||
    typeof value.author_id !== "string" ||
    typeof value.author_name !== "string" ||
    typeof value.content !== "string" ||
    !isIsoDate(value.created_at) ||
    !isIsoDate(value.updated_at)
  ) {
    throw malformedApiError();
  }
  return {
    id: value.id,
    card_id: value.card_id,
    author_id: value.author_id,
    author_name: value.author_name,
    content: value.content,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

/** E23: the list of active comments in creation order. */
export function parseCommentList(value: unknown): Comment[] {
  if (!Array.isArray(value)) throw malformedApiError();
  return value.map(parseComment);
}

/** True when the text was changed after it was posted. A new comment has equal timestamps (N1). */
export function isEdited(comment: Pick<Comment, "created_at" | "updated_at">): boolean {
  return Date.parse(comment.updated_at) > Date.parse(comment.created_at);
}

/** The local date and time of a comment, for the visible line under the author. */
export function formatCommentTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** The local day, such as "12 Nov", for control names that tell two comments apart. */
export function formatCommentDay(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(iso));
}
