import { malformedApiError } from "./errors";
import type { Card, Column, ColumnWithCards } from "./types";

// Allowlist parsers for the column and card payloads (E07, E13 to E20; Requirement 11.4, FE-A1).
// Each parser copies only its documented fields and throws ApiError on any other shape, so an
// extra key from upstream never reaches a component.

type Json = Record<string, unknown>;

export const MAX_POSITION_VERSION = 2_147_483_647;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw malformedApiError();
  return value;
}

export function parsePositionVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_POSITION_VERSION
  ) {
    throw malformedApiError();
  }
  return value;
}

export function parseCard(value: unknown): Card {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.column_id !== "string" ||
    typeof value.title !== "string" ||
    !isOrder(value.order)
  ) {
    throw malformedApiError();
  }
  return {
    id: value.id,
    column_id: value.column_id,
    title: value.title,
    description: nullableString(value.description ?? null),
    assignee_id: nullableString(value.assignee_id ?? null),
    assignee_name: nullableString(value.assignee_name ?? null),
    order: value.order,
  };
}

export function parseColumn(value: unknown): Column {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.board_id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.is_done !== "boolean" ||
    !isOrder(value.order)
  ) {
    throw malformedApiError();
  }
  return {
    id: value.id,
    board_id: value.board_id,
    name: value.name,
    is_done: value.is_done,
    order: value.order,
  };
}

export function parseColumnList(value: unknown): Column[] {
  if (!Array.isArray(value)) throw malformedApiError();
  return value.map(parseColumn);
}

export function parseColumnWithCards(value: unknown): ColumnWithCards {
  if (!isRecord(value) || !Array.isArray(value.cards)) throw malformedApiError();
  return { ...parseColumn(value), cards: value.cards.map(parseCard) };
}

export function parseColumnWithCardsList(value: unknown): ColumnWithCards[] {
  if (!Array.isArray(value)) throw malformedApiError();
  return value.map(parseColumnWithCards);
}

/** E13: `{column, position_version}`. */
export function parseColumnCreated(value: unknown): { column: Column; position_version: number } {
  if (!isRecord(value)) throw malformedApiError();
  return {
    column: parseColumn(value.column),
    position_version: parsePositionVersion(value.position_version),
  };
}

/** E15 and E19: `{position_version}`. */
export function parseVersionOnly(value: unknown): { position_version: number } {
  if (!isRecord(value)) throw malformedApiError();
  return { position_version: parsePositionVersion(value.position_version) };
}

/** E16: `{columns, position_version}` with every active column in order. */
export function parseColumnReordered(value: unknown): {
  columns: Column[];
  position_version: number;
} {
  if (!isRecord(value)) throw malformedApiError();
  return {
    columns: parseColumnList(value.columns),
    position_version: parsePositionVersion(value.position_version),
  };
}

/** E17: `{card, position_version}`. */
export function parseCardCreated(value: unknown): { card: Card; position_version: number } {
  if (!isRecord(value)) throw malformedApiError();
  return {
    card: parseCard(value.card),
    position_version: parsePositionVersion(value.position_version),
  };
}

/** E20: `{card, columns, position_version}` with only the affected column lists. */
export function parseCardMoved(value: unknown): {
  card: Card;
  columns: ColumnWithCards[];
  position_version: number;
} {
  if (!isRecord(value)) throw malformedApiError();
  return {
    card: parseCard(value.card),
    columns: parseColumnWithCardsList(value.columns),
    position_version: parsePositionVersion(value.position_version),
  };
}
