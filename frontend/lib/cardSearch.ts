import { malformedApiError } from "./errors";
import type { ColumnWithCards, HeldSearch, SearchResult, VisibleResult } from "./types";

// Card search rules shared by the hook and the component (design DD6 to DD8, Requirement 5).

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULT_LIMIT = 20;
export const SEARCH_QUERY_MAX = 100;

/** The declared same-origin path for one search. `q` is the trimmed text, encoded once. */
export function cardSearchPath(boardId: string, q: string): string {
  return `/api/boards/${boardId}/cards/search?q=${encodeURIComponent(q)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** E22 allowlist: copies `id`, `title` and `column_id` and throws ApiError on any other shape. */
export function parseSearchResults(value: unknown): SearchResult[] {
  if (!Array.isArray(value)) throw malformedApiError();
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.column_id !== "string"
    ) {
      throw malformedApiError();
    }
    return { id: item.id, title: item.title, column_id: item.column_id };
  });
}

/** Case-insensitive substring test, used only for a title that changed after the response (Q2). */
export function titleMatches(title: string, query: string): boolean {
  return title.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

/**
 * Turns the held E22 response into the rows to show, from the live board state (S8, Q2).
 * A card the board no longer holds is hidden, not removed from `held`, so a rolled-back delete
 * brings its result back. A live title equal to the returned title is trusted as a server match.
 * A changed title is re-tested with `titleMatches`. The row shows the live title and column.
 */
export function resolveSearchResults(held: HeldSearch, columns: ColumnWithCards[]): VisibleResult[] {
  const live = new Map<string, { title: string; columnName: string }>();
  for (const column of columns) {
    for (const card of column.cards) live.set(card.id, { title: card.title, columnName: column.name });
  }
  const rows: VisibleResult[] = [];
  for (const item of held.items) {
    const current = live.get(item.id);
    if (!current) continue;
    if (current.title !== item.title && !titleMatches(current.title, held.query)) continue;
    rows.push({ cardId: item.id, title: current.title, columnName: current.columnName });
  }
  return rows;
}
