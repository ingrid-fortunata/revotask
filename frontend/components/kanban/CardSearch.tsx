"use client";

import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { useCardSearch } from "@/hooks/useCardSearch";
import { resolveSearchResults, SEARCH_QUERY_MAX, SEARCH_RESULT_LIMIT } from "@/lib/cardSearch";
import type { ColumnWithCards } from "@/lib/types";

export interface CardSearchProps {
  boardId: string;
  /** The live board state. Results are resolved against it on every render (S8). */
  columns: ColumnWithCards[];
  /** Opens the card detail modal for a card of the live board. */
  onOpenCard: (cardId: string) => void;
  /** The board is gone or access was lost (a 404). */
  onAccessLost: () => void;
}

const ERROR_TEXT = "Search could not be completed.";

function plural(count: number): string {
  return `${count} ${count === 1 ? "result" : "results"}`;
}

// The board search (Requirement 5; design "States and screens"). The field, one live region and
// five states: idle (nothing), "Searching…", results, no results, error. The hook owns the
// debounce and the requests. Visibility comes from `resolveSearchResults`, so a deleted or edited
// card follows the board without a new request. The search never reads the Kanban gate (S8).
export function CardSearch({ boardId, columns, onOpenCard, onAccessLost }: CardSearchProps) {
  const { query, setQuery, status, held, fieldError, retry } = useCardSearch({ boardId, onAccessLost });
  const visible = held ? resolveSearchResults(held, columns) : [];
  const atLimit = held !== null && held.items.length >= SEARCH_RESULT_LIMIT;

  let announcement = "";
  if (status === "loading") announcement = "Searching…";
  else if (status === "ready") announcement = visible.length > 0 ? plural(visible.length) : "No cards match.";
  else if (status === "error") announcement = fieldError ?? ERROR_TEXT;

  return (
    <div className="surface flex flex-col gap-3 p-4 sm:p-5">
      <div className="w-full sm:max-w-md">
        <FormField
          id="card-search"
          name="card-search"
          label="Search cards"
          type="search"
          autoComplete="off"
          maxLength={SEARCH_QUERY_MAX}
          value={query}
          error={status === "error" ? (fieldError ?? undefined) : undefined}
          onChange={setQuery}
        />
      </div>
      {/* aria-live without role="status", so the board's own status region stays the only one. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      {status === "loading" ? (
        <p aria-busy="true" className="break-words text-sm text-base-content/70">
          Searching…
        </p>
      ) : null}

      {status === "error" && fieldError === null ? (
        <div role="group" aria-label="Search error" className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="break-words">{ERROR_TEXT}</p>
          <BaseButton className="w-full sm:w-auto" onClick={retry}>
            Retry
          </BaseButton>
        </div>
      ) : null}

      {status === "ready" && visible.length === 0 && held ? (
        <p className="break-words text-sm text-base-content/70">No cards match &ldquo;{held.query}&rdquo;.</p>
      ) : null}

      {status === "ready" && visible.length > 0 ? (
        <>
          <ul aria-label="Search results" className="divide-y divide-base-300">
            {visible.map((row) => (
              <li key={row.cardId} className="min-w-0">
                <BaseButton
                  variant="ghost"
                  aria-label={`${row.title}, in ${row.columnName}`}
                  className="h-auto w-full flex-col items-start justify-start gap-0 whitespace-normal break-words py-2 text-left font-medium"
                  onClick={() => onOpenCard(row.cardId)}
                >
                  <span className="min-w-0 break-words">{row.title}</span>
                  <span className="min-w-0 break-words text-sm font-normal text-base-content/70">{row.columnName}</span>
                </BaseButton>
              </li>
            ))}
          </ul>
          {atLimit ? <p className="text-sm text-base-content/70">Showing {plural(visible.length)}.</p> : null}
        </>
      ) : null}
    </div>
  );
}
