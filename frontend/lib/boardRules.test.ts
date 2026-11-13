// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBoardName, validateMemberEmail } from "./boardRules";

// Feature: boards-membership, Property 1 / Property 3
// Client half of the parity check. The same shared fixture is read by the Flask schema tests,
// so a difference between the client rules and the server rules fails a test on one side.

type Expand = unknown;
function expand(value: Expand): unknown {
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 2 && "repeat" in record && "times" in record) {
      return String(record.repeat).repeat(Number(record.times));
    }
    if (keys.length === 1 && "concat" in record) return (record.concat as Expand[]).map(expand).join("");
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, expand(v)]));
  }
  return value;
}

type Expectation = { accepted?: Record<string, unknown>; fields?: Record<string, string> };
type Case = { id: string; set: Record<string, unknown>; drop: string[]; expect: Expectation };
type Form = { base: Record<string, unknown>; cases: Case[] };

const file = JSON.parse(
  readFileSync(join(process.cwd(), "..", "specs", "fixtures", "board-field-cases.json"), "utf8"),
) as Record<"board_create" | "member_add", Form>;

function bodyFor(form: Form, c: Case): Record<string, unknown> {
  const body = { ...(expand(form.base) as object), ...(expand(c.set) as object) } as Record<string, unknown>;
  for (const key of c.drop) delete body[key];
  return body;
}

function expectationOf(c: Case): Expectation {
  return expand(c.expect) as Expectation;
}

// Cases that name the rule's field. Unknown-field cases (role) belong to the schema tests (Property 2).
function casesFor(form: Form, field: string): Case[] {
  return form.cases.filter((c) => {
    const expected = expectationOf(c);
    return field in (expected.fields ?? {}) || field in (expected.accepted ?? {});
  });
}

describe("Feature: boards-membership, Property 1: board name rule matches board-field-cases.json", () => {
  const cases = casesFor(file.board_create, "name");

  it("runs every name case in the fixture", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it("treats an empty or blank name as a length error, like the server", () => {
    const result = validateBoardName("");
    expect(result).toEqual({ ok: false, error: "Must be 1 to 100 characters." });
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const result = validateBoardName(bodyFor(file.board_create, c).name);
    const expected = expectationOf(c);
    if (expected.fields) {
      expect(result).toEqual({ ok: false, error: expected.fields.name });
    } else {
      expect(result).toEqual({ ok: true, name: expected.accepted?.name });
    }
  });
});

describe("Feature: boards-membership, Property 3: member email rule matches board-field-cases.json", () => {
  const cases = casesFor(file.member_add, "email");

  it("runs every email case in the fixture", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it("treats an empty member email as a format error, not Required (fixture email-empty)", () => {
    const result = validateMemberEmail("");
    expect(result).toEqual({ ok: false, error: "Enter a valid email address." });
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const result = validateMemberEmail(bodyFor(file.member_add, c).email);
    const expected = expectationOf(c);
    if (expected.fields) {
      expect(result).toEqual({ ok: false, error: expected.fields.email });
    } else {
      expect(result).toEqual({ ok: true, email: expected.accepted?.email });
    }
  });
});
