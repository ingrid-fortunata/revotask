import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { formatCommentDay, formatCommentTime, isEdited, parseComment, parseCommentList } from "./comments";

const COMMENT = {
  id: "c1",
  card_id: "card1",
  author_id: "u1",
  author_name: "Mia",
  content: "Looks good\nsecond line",
  created_at: "2026-11-13T09:00:00+00:00",
  updated_at: "2026-11-13T09:00:00+00:00",
};

describe("parseComment", () => {
  it("copies exactly the seven documented fields", () => {
    expect(parseComment({ ...COMMENT, password_hash: "x", deleted_at: null })).toEqual(COMMENT);
  });

  const MALFORMED: Array<[string, unknown]> = [
    ["not an object", "x"],
    ["null", null],
    ["an array", []],
    ...Object.keys(COMMENT).map((key): [string, unknown] => [`a missing ${key}`, { ...COMMENT, [key]: undefined }]),
    ["a numeric id", { ...COMMENT, id: 7 }],
    ["a null author name", { ...COMMENT, author_name: null }],
    ["numeric content", { ...COMMENT, content: 5 }],
    ["a bad created_at", { ...COMMENT, created_at: "yesterday" }],
    ["a numeric updated_at", { ...COMMENT, updated_at: 1700000000 }],
  ];

  it.each(MALFORMED)("throws ApiError for %s", (_label, value) => {
    expect(() => parseComment(value)).toThrow(ApiError);
  });
});

describe("parseCommentList", () => {
  it("parses an empty list and a list of comments in order", () => {
    expect(parseCommentList([])).toEqual([]);
    const second = { ...COMMENT, id: "c2" };
    expect(parseCommentList([COMMENT, second]).map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it.each([["an object", {}], ["null", null], ["a string", "x"]])("throws for %s", (_l, value) => {
    expect(() => parseCommentList(value)).toThrow(ApiError);
  });

  it("throws when any item is malformed", () => {
    expect(() => parseCommentList([COMMENT, { ...COMMENT, id: undefined }])).toThrow(ApiError);
  });
});

describe("isEdited, formatCommentTime and formatCommentDay", () => {
  it("is edited only when updated_at is strictly later than created_at (N1)", () => {
    expect(isEdited(COMMENT)).toBe(false);
    expect(isEdited({ ...COMMENT, updated_at: "2026-11-13T09:00:00.001+00:00" })).toBe(true);
    expect(isEdited({ ...COMMENT, updated_at: "2026-11-13T08:59:59+00:00" })).toBe(false);
  });

  it("formats a local date and time and a short day", () => {
    expect(formatCommentTime(COMMENT.created_at)).toMatch(/2026/);
    expect(formatCommentDay(COMMENT.created_at)).toMatch(/Nov|13/);
  });
});
