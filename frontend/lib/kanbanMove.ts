import type { Card, Column, ColumnWithCards } from "./types";

// Pure helpers for optimistic moves and for merging server answers (design "Board state and the
// gate"). Array position is the truth for display, so a move only changes where a card sits and
// its `column_id`. The server's `order` values replace the local ones when its answer is merged.
// Every function returns a new array and never mutates its input.

type Columns = readonly ColumnWithCards[];

export function findCard(
  columns: Columns,
  cardId: string,
): { card: Card; column: ColumnWithCards } | null {
  for (const column of columns) {
    const card = column.cards.find((item) => item.id === cardId);
    if (card) return { card, column };
  }
  return null;
}

/** True when the card is already where the request would put it (Requirement 9.9). */
export function isCardUnchanged(
  columns: Columns,
  cardId: string,
  columnId: string,
  beforeCardId: string | null,
): boolean {
  const found = findCard(columns, cardId);
  if (!found || found.column.id !== columnId) return false;
  const ids = found.column.cards.map((card) => card.id);
  const position = ids.indexOf(cardId);
  if (beforeCardId === null) return position === ids.length - 1;
  return ids[position + 1] === beforeCardId;
}

/** Move a card before an anchor card, or to the end when the anchor is null. */
export function applyCardMove(
  columns: Columns,
  cardId: string,
  columnId: string,
  beforeCardId: string | null,
): ColumnWithCards[] {
  const found = findCard(columns, cardId);
  if (!found || !columns.some((column) => column.id === columnId)) return [...columns];
  const moved: Card = { ...found.card, column_id: columnId };
  return columns.map((column) => {
    const without = column.cards.filter((card) => card.id !== cardId);
    if (column.id !== columnId) {
      return without.length === column.cards.length ? column : { ...column, cards: without };
    }
    const index = beforeCardId === null ? without.length : without.findIndex((c) => c.id === beforeCardId);
    const at = index < 0 ? without.length : index;
    return { ...column, cards: [...without.slice(0, at), moved, ...without.slice(at)] };
  });
}

/** True when the column already sits where the request would put it. */
export function isColumnUnchanged(
  columns: Columns,
  columnId: string,
  beforeColumnId: string | null,
): boolean {
  const ids = columns.map((column) => column.id);
  const position = ids.indexOf(columnId);
  if (position < 0) return false;
  if (beforeColumnId === null) return position === ids.length - 1;
  return ids[position + 1] === beforeColumnId;
}

/** Move a column before an anchor column, or to the end when the anchor is null. */
export function applyColumnMove(
  columns: Columns,
  columnId: string,
  beforeColumnId: string | null,
): ColumnWithCards[] {
  const moved = columns.find((column) => column.id === columnId);
  if (!moved) return [...columns];
  const without = columns.filter((column) => column.id !== columnId);
  const index = beforeColumnId === null ? without.length : without.findIndex((c) => c.id === beforeColumnId);
  const at = index < 0 ? without.length : index;
  return [...without.slice(0, at), moved, ...without.slice(at)];
}

/** Replace whole column lists with the server's affected lists (E20). Other columns stay. */
export function mergeAffected(columns: Columns, affected: readonly ColumnWithCards[]): ColumnWithCards[] {
  const byId = new Map(affected.map((column) => [column.id, column]));
  return columns.map((column) => byId.get(column.id) ?? column);
}

/**
 * Apply the server's column order (E16). The answer has no cards, so each column keeps the cards
 * it already has. A column this client has not seen starts empty, and a column missing from the
 * answer is dropped.
 */
export function applyColumnOrder(columns: Columns, ordered: readonly Column[]): ColumnWithCards[] {
  const cards = new Map(columns.map((column) => [column.id, column.cards]));
  return ordered.map((column) => ({ ...column, cards: cards.get(column.id) ?? [] }));
}

/** Text for the live region after a card move. It names the card, the column and the place. */
export function moveAnnouncement(columns: Columns, cardId: string): string {
  const found = findCard(columns, cardId);
  if (!found) return "The card was moved.";
  const position = found.column.cards.findIndex((card) => card.id === cardId) + 1;
  return `Moved ${found.card.title} to ${found.column.name}, position ${position} of ${found.column.cards.length}.`;
}

/** Text for the live region after a column move. */
export function columnMoveAnnouncement(columns: Columns, columnId: string): string {
  const position = columns.findIndex((column) => column.id === columnId);
  if (position < 0) return "The column was moved.";
  return `Moved column ${columns[position].name}, position ${position + 1} of ${columns.length}.`;
}
