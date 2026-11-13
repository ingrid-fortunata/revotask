// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMENT_MESSAGES, validateCommentContent } from "./commentRules";

// Client half of the parity check with backend/tests/test_comments_schema.py. Both read
// specs/fixtures/comment-field-cases.json, so a rule that differs on one side fails a test there.

type Json = Record<string, unknown>;
type Case = { id: string; set: Json; drop: string[]; expect: { accepted?: Json; fields?: Record<string, string> } };

function expand(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Json;
    if ("repeat" in record && "times" in record) return String(record.repeat).repeat(Number(record.times));
  }
  return value;
}

const file = JSON.parse(
  readFileSync(join(process.cwd(), "..", "specs", "fixtures", "comment-field-cases.json"), "utf8"),
) as { comment_content: { base: Json; cases: Case[] } };
const form = file.comment_content;

function bodyFor(c: Case): Json {
  const body: Json = { ...form.base, ...c.set };
  for (const key of c.drop) delete body[key];
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, expand(v)]));
}

describe("Feature: comments, Property 1: client rule matches comment-field-cases.json", () => {
  it("runs the cases in the fixture", () => {
    expect(form.cases.length).toBeGreaterThan(0);
  });

  it.each(form.cases.map((c) => [c.id, c] as const))("content: %s", (_id, c) => {
    const result = validateCommentContent(bodyFor(c).content);
    if (c.expect.fields) {
      expect(result).toEqual({ ok: false, error: c.expect.fields.content });
    } else {
      expect(result).toEqual({ ok: true, value: expand(c.expect.accepted?.content) });
    }
  });
});

describe("validateCommentContent", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(validateCommentContent("😀".repeat(2000)).ok).toBe(true);
    expect(validateCommentContent("😀".repeat(2001)).ok).toBe(false);
  });

  it("treats a blank value as a length error, like the server", () => {
    expect(validateCommentContent("")).toEqual({ ok: false, error: COMMENT_MESSAGES.content });
    expect(validateCommentContent("  \n ")).toEqual({ ok: false, error: COMMENT_MESSAGES.content });
  });

  it("keeps inner line breaks and trims the outside", () => {
    expect(validateCommentContent("\n one\n\ntwo \n")).toEqual({ ok: true, value: "one\n\ntwo" });
  });
});
