import { describe, expect, it } from "vitest";
import {
  applyCardMove,
  applyColumnMove,
  applyColumnOrder,
  columnMoveAnnouncement,
  findCard,
  isCardUnchanged,
  isColumnUnchanged,
  mergeAffected,
  moveAnnouncement,
} from "./kanbanMove";
import type { Card, ColumnWithCards } from "./types";

function card(id: string, columnId: string, order: number): Card {
  return {
    id,
    column_id: columnId,
    title: `Card ${id}`,
    description: null,
    assignee_id: null,
    assignee_name: null,
    order,
  };
}

function column(id: string, order: number, cards: Card[]): ColumnWithCards {
  return { id, board_id: "b", name: `Col ${id}`, is_done: false, order, cards };
}

const BOARD = (): ColumnWithCards[] => [
  column("todo", 1024, [card("a", "todo", 1024), card("b", "todo", 2048), card("c", "todo", 3072)]),
  column("doing", 2048, [card("d", "doing", 1024)]),
  column("empty", 3072, []),
];

const ids = (columns: ColumnWithCards[], columnId: string) =>
  columns.find((c) => c.id === columnId)?.cards.map((x) => x.id);

describe("applyCardMove", () => {
  it.each([
    ["down within a column (to the end)", "a", "todo", null, ["b", "c", "a"]],
    ["down within a column (before a later card)", "a", "todo", "c", ["b", "a", "c"]],
    ["up within a column", "c", "todo", "a", ["c", "a", "b"]],
  ])("%s", (_label, cardId, columnId, before, expected) => {
    expect(ids(applyCardMove(BOARD(), cardId, columnId, before), columnId)).toEqual(expected);
  });

  it("moves across columns before an anchor and to the end", () => {
    const first = applyCardMove(BOARD(), "a", "doing", "d");
    expect(ids(first, "todo")).toEqual(["b", "c"]);
    expect(ids(first, "doing")).toEqual(["a", "d"]);
    expect(first[1].cards[0].column_id).toBe("doing");
    expect(ids(applyCardMove(BOARD(), "a", "doing", null), "doing")).toEqual(["d", "a"]);
  });

  it("moves into an empty column", () => {
    expect(ids(applyCardMove(BOARD(), "d", "empty", null), "empty")).toEqual(["d"]);
  });

  it("does not mutate its input and leaves untouched columns by reference", () => {
    const board = BOARD();
    const snapshot = JSON.stringify(board);
    const next = applyCardMove(board, "a", "doing", null);
    expect(JSON.stringify(board)).toBe(snapshot);
    expect(next[2]).toBe(board[2]);
  });

  it("returns an equal board for an unknown card or column", () => {
    expect(applyCardMove(BOARD(), "zzz", "doing", null)).toEqual(BOARD());
    expect(applyCardMove(BOARD(), "a", "zzz", null)).toEqual(BOARD());
  });
});

describe("isCardUnchanged", () => {
  it.each([
    ["last card to the end", "c", "todo", null, true],
    ["a card before its next sibling", "a", "todo", "b", true],
    ["first card to the end", "a", "todo", null, false],
    ["a card before its previous sibling", "b", "todo", "a", false],
    ["another column", "a", "doing", null, false],
    ["an unknown card", "zzz", "todo", null, false],
    ["the only card to the end", "d", "doing", null, true],
  ])("%s", (_label, cardId, columnId, before, expected) => {
    expect(isCardUnchanged(BOARD(), cardId, columnId, before)).toBe(expected);
  });
});

describe("column moves", () => {
  it("moves a column before an anchor and to the end", () => {
    expect(applyColumnMove(BOARD(), "empty", "todo").map((c) => c.id)).toEqual(["empty", "todo", "doing"]);
    expect(applyColumnMove(BOARD(), "todo", null).map((c) => c.id)).toEqual(["doing", "empty", "todo"]);
  });

  it("detects an unchanged column position", () => {
    expect(isColumnUnchanged(BOARD(), "empty", null)).toBe(true);
    expect(isColumnUnchanged(BOARD(), "todo", "doing")).toBe(true);
    expect(isColumnUnchanged(BOARD(), "todo", null)).toBe(false);
    expect(isColumnUnchanged(BOARD(), "zzz", null)).toBe(false);
  });
});

describe("server merges", () => {
  it("replaces only the affected lists", () => {
    const board = BOARD();
    const affected = [column("todo", 1024, [card("b", "todo", 1024)]), column("doing", 2048, [card("d", "doing", 1024)])];
    const merged = mergeAffected(board, affected);
    expect(ids(merged, "todo")).toEqual(["b"]);
    expect(merged[2]).toBe(board[2]);
  });

  it("applies the server's column order and keeps each column's cards", () => {
    const board = BOARD();
    const ordered = [
      { id: "empty", board_id: "b", name: "Renamed", is_done: false, order: 1024 },
      { id: "todo", board_id: "b", name: "Col todo", is_done: false, order: 2048 },
      { id: "new", board_id: "b", name: "Added elsewhere", is_done: false, order: 3072 },
    ];
    const merged = applyColumnOrder(board, ordered);
    expect(merged.map((c) => c.id)).toEqual(["empty", "todo", "new"]);
    expect(merged[0].name).toBe("Renamed");
    expect(ids(merged, "todo")).toEqual(["a", "b", "c"]);
    expect(merged[2].cards).toEqual([]);
  });

  it("finds a card with its column", () => {
    expect(findCard(BOARD(), "d")?.column.id).toBe("doing");
    expect(findCard(BOARD(), "zzz")).toBeNull();
  });
});

describe("live region text", () => {
  it("names the card, the column and the place", () => {
    const moved = applyCardMove(BOARD(), "a", "doing", "d");
    expect(moveAnnouncement(moved, "a")).toBe("Moved Card a to Col doing, position 1 of 2.");
    expect(moveAnnouncement(moved, "zzz")).toBe("The card was moved.");
  });

  it("names a moved column and its place", () => {
    const moved = applyColumnMove(BOARD(), "empty", "todo");
    expect(columnMoveAnnouncement(moved, "empty")).toBe("Moved column Col empty, position 1 of 3.");
  });
});
