import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import {
  MAX_POSITION_VERSION,
  parseCard,
  parseCardCreated,
  parseCardMoved,
  parseColumn,
  parseColumnCreated,
  parseColumnReordered,
  parseColumnWithCardsList,
  parsePositionVersion,
  parseVersionOnly,
} from "./kanban";

const card = {
  id: "k1",
  column_id: "c1",
  title: "Fix login",
  description: null,
  assignee_id: null,
  assignee_name: null,
  order: 1024,
};
const column = { id: "c1", board_id: "b1", name: "To do", is_done: false, order: 1024 };

describe("kanban parsers", () => {
  it("keep only the documented card fields", () => {
    expect(parseCard({ ...card, password_hash: "x", email: "a@b.c" })).toEqual(card);
  });

  it("reject a card with a wrong type, a bad order or a missing field", () => {
    for (const bad of [
      { ...card, title: 5 },
      { ...card, order: 0 },
      { ...card, order: Number.POSITIVE_INFINITY },
      { ...card, description: 3 },
      { ...card, id: undefined },
      null,
      [],
    ]) {
      expect(() => parseCard(bad)).toThrow(ApiError);
    }
  });

  it("keep only the documented column fields and reject others", () => {
    expect(parseColumn({ ...column, deleted_at: null })).toEqual(column);
    expect(() => parseColumn({ ...column, is_done: "no" })).toThrow(ApiError);
    expect(() => parseColumn({ ...column, name: undefined })).toThrow(ApiError);
  });

  it("parse nested columns and reject a column without a cards array", () => {
    expect(parseColumnWithCardsList([{ ...column, cards: [card] }])).toEqual([{ ...column, cards: [card] }]);
    expect(() => parseColumnWithCardsList([column])).toThrow(ApiError);
    expect(() => parseColumnWithCardsList({})).toThrow(ApiError);
  });

  it("parse the E13, E15/E19, E16, E17 and E20 shapes", () => {
    expect(parseColumnCreated({ column, position_version: 3 })).toEqual({ column, position_version: 3 });
    expect(parseVersionOnly({ position_version: 4, extra: 1 })).toEqual({ position_version: 4 });
    expect(parseColumnReordered({ columns: [column], position_version: 5 })).toEqual({
      columns: [column],
      position_version: 5,
    });
    expect(parseCardCreated({ card, position_version: 6 })).toEqual({ card, position_version: 6 });
    const withCards = [{ ...column, cards: [card] }];
    expect(parseCardMoved({ card, columns: withCards, position_version: 7 })).toEqual({
      card,
      columns: withCards,
      position_version: 7,
    });
    expect(() => parseCardMoved({ card, position_version: 7 })).toThrow(ApiError);
  });

  it("accept a version from 0 to the INTEGER ceiling only", () => {
    expect(parsePositionVersion(0)).toBe(0);
    expect(parsePositionVersion(MAX_POSITION_VERSION)).toBe(MAX_POSITION_VERSION);
    for (const bad of [-1, 1.5, MAX_POSITION_VERSION + 1, "1", null, true, Number.NaN]) {
      expect(() => parsePositionVersion(bad)).toThrow(ApiError);
    }
  });
});
