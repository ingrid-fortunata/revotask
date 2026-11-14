import { describe, expect, it } from "vitest";
import { board, card, column } from "@/components/kanban/kanbanTestData";
import {
  cardSearchPath,
  parseSearchResults,
  resolveSearchResults,
  SEARCH_DEBOUNCE_MS,
  SEARCH_RESULT_LIMIT,
  titleMatches,
} from "./cardSearch";
import { ApiError } from "./errors";
import type { HeldSearch } from "./types";

const BOARD = "0f9c4f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f";

describe("constants", () => {
  it("pins the debounce and the result cap", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
    expect(SEARCH_RESULT_LIMIT).toBe(20);
  });
});

describe("cardSearchPath", () => {
  it.each([
    ["plain", "plain"],
    ["a b", "a%20b"],
    ["a&b", "a%26b"],
    ["a#b", "a%23b"],
    ["50%", "50%25"],
    ["a=b?c", "a%3Db%3Fc"],
    ["é", "%C3%A9"],
  ])("encodes %j once", (q, encoded) => {
    expect(cardSearchPath(BOARD, q)).toBe(`/api/boards/${BOARD}/cards/search?q=${encoded}`);
  });
});

describe("parseSearchResults", () => {
  it("copies only the documented fields", () => {
    const parsed = parseSearchResults([{ id: "a", title: "T", column_id: "c", description: "secret", extra: 1 }]);
    expect(parsed).toEqual([{ id: "a", title: "T", column_id: "c" }]);
  });

  it("returns an empty list for an empty list", () => {
    expect(parseSearchResults([])).toEqual([]);
  });

  it.each([null, {}, "x", [null], [{ id: "a", title: "T" }], [{ id: 1, title: "T", column_id: "c" }]])(
    "throws an ApiError for %j",
    (value) => {
      expect(() => parseSearchResults(value)).toThrow(ApiError);
    },
  );
});

describe("titleMatches", () => {
  it("is a case-insensitive substring test", () => {
    expect(titleMatches("Write the Report", "REPORT")).toBe(true);
    expect(titleMatches("Write the Report", "port ")).toBe(false);
    expect(titleMatches("Write", "")).toBe(true);
  });
});

describe("resolveSearchResults (properties 6 to 8)", () => {
  const held = (query: string, ...ids: [string, string][]): HeldSearch => ({
    query,
    items: ids.map(([id, title]) => ({ id, title, column_id: "any" })),
  });

  it("shows the live title and live column of an unchanged result", () => {
    const columns = board();
    expect(resolveSearchResults(held("card", ["a", "Card a"], ["d", "Card d"]), columns)).toEqual([
      { cardId: "a", title: "Card a", columnName: "Col todo" },
      { cardId: "d", title: "Card d", columnName: "Col doing" },
    ]);
  });

  it("keeps the order of the response", () => {
    const rows = resolveSearchResults(held("card", ["d", "Card d"], ["a", "Card a"]), board());
    expect(rows.map((row) => row.cardId)).toEqual(["d", "a"]);
  });

  it("trusts the server match when the title is unchanged, even if the client test would fail", () => {
    // The server matched "ß" and "SS" case-insensitively. JavaScript does not, so only an unchanged
    // title may skip the client test (Q2).
    const columns = [column("todo", 1, [card("a", "todo", 1, { title: "Straße" })])];
    expect(resolveSearchResults(held("STRASSE", ["a", "Straße"]), columns)).toHaveLength(1);
  });

  it("hides a result whose edited title no longer matches", () => {
    const columns = board();
    columns[0].cards[0] = { ...columns[0].cards[0], title: "Something else" };
    expect(resolveSearchResults(held("card", ["a", "Card a"]), columns)).toEqual([]);
  });

  it("shows the new title when an edit still matches", () => {
    const columns = board();
    columns[0].cards[0] = { ...columns[0].cards[0], title: "My CARD renamed" };
    expect(resolveSearchResults(held("card", ["a", "Card a"]), columns)).toEqual([
      { cardId: "a", title: "My CARD renamed", columnName: "Col todo" },
    ]);
  });

  it("shows the new column after a move", () => {
    const columns = board();
    const [moved] = columns[0].cards.splice(0, 1);
    columns[1].cards.push({ ...moved, column_id: "doing" });
    expect(resolveSearchResults(held("card", ["a", "Card a"]), columns)[0].columnName).toBe("Col doing");
  });

  it("hides a deleted card and restores it when the delete is rolled back (property 7)", () => {
    const original = board();
    const response = held("card", ["a", "Card a"], ["b", "Card b"]);
    const before = resolveSearchResults(response, original);
    const afterDelete = board();
    afterDelete[0].cards = afterDelete[0].cards.filter((c) => c.id !== "a");
    expect(resolveSearchResults(response, afterDelete).map((row) => row.cardId)).toEqual(["b"]);
    expect(resolveSearchResults(response, original)).toEqual(before);
    expect(response.items).toHaveLength(2); // the held response is never pruned
  });

  it("never shows a card that was not in the response, whatever its title (property 8)", () => {
    const columns = board();
    columns[1].cards.push(card("new", "doing", 4096, { title: "Card new matches too" }));
    expect(resolveSearchResults(held("card", ["a", "Card a"]), columns).map((row) => row.cardId)).toEqual(["a"]);
  });

  it("returns an empty list for an empty board", () => {
    expect(resolveSearchResults(held("card", ["a", "Card a"]), [])).toEqual([]);
  });
});
