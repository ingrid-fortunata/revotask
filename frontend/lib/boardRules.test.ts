// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SPRINT_MAX_DAYS,
  sprintDayNumber,
  validateBoardName,
  validateMemberEmail,
  validateSprint,
} from "./boardRules";

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
type Case = {
  id: string;
  set: Record<string, unknown>;
  drop: string[];
  expect: Expectation;
  backend_only?: boolean;
};
type Form = { base: Record<string, unknown>; cases: Case[] };

const file = JSON.parse(
  readFileSync(join(process.cwd(), "..", "specs", "fixtures", "board-field-cases.json"), "utf8"),
) as Record<"board_create" | "member_add" | "board_sprint_create" | "board_sprint_update", Form>;

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

// Revision 2 (sprint), Property 18: the sprint rule matches the same fixture the Flask schema reads.
// Unknown-key cases are a server concern and are skipped.
describe("Feature: boards-membership, Property 18: sprint rule matches board-field-cases.json", () => {
  const sprintCases = [...file.board_sprint_create.cases, ...file.board_sprint_update.cases].filter(
    (c) => !c.backend_only && (!c.expect.fields || Object.keys(c.expect.fields).some((k) => k.startsWith("sprint_"))),
  );
  const forms = (c: Case) =>
    file.board_sprint_create.cases.includes(c) ? file.board_sprint_create : file.board_sprint_update;

  it("runs every sprint case in the fixture", () => {
    expect(sprintCases.length).toBeGreaterThan(30);
  });

  it.each(sprintCases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const body = bodyFor(forms(c), c);
    const expected = expectationOf(c);
    const result = validateSprint(body.sprint_start, body.sprint_end);
    if (expected.fields) {
      const errors = Object.fromEntries(
        Object.entries(expected.fields).filter(([key]) => key.startsWith("sprint_")),
      );
      expect(result).toEqual({ ok: false, errors });
    } else if (body.sprint_start == null && body.sprint_end == null) {
      expect(result).toEqual({ ok: true, sprint: null });
    } else {
      expect(result).toEqual({
        ok: true,
        sprint: { sprint_start: body.sprint_start, sprint_end: body.sprint_end },
      });
    }
  });
});

describe("validateSprint and sprintDayNumber", () => {
  it("counts days in UTC, so a month, a year and a leap day add up", () => {
    const day = (value: string) => sprintDayNumber(value) as number;
    expect(day("2026-12-01") - day("2026-11-30")).toBe(1);
    expect(day("2027-01-01") - day("2026-12-31")).toBe(1);
    expect(day("2028-03-01") - day("2028-02-28")).toBe(2);
    expect(day("2027-03-01") - day("2027-02-28")).toBe(1);
  });

  it.each(["0000-01-01", "2026-13-01", "2026-00-10", "2026-04-31", "2026-4-1", "２０２６-11-16", "", 20261116, null])(
    "rejects %j as a date",
    (value) => {
      expect(sprintDayNumber(value)).toBeNull();
    },
  );

  it("treats null and undefined as not set", () => {
    expect(validateSprint(undefined, undefined)).toEqual({ ok: true, sprint: null });
    expect(validateSprint(null, undefined)).toEqual({ ok: true, sprint: null });
  });

  it("accepts a range of exactly 90 days and rejects 91", () => {
    expect(SPRINT_MAX_DAYS).toBe(90);
    expect(validateSprint("2026-11-01", "2027-01-29").ok).toBe(true);
    expect(validateSprint("2026-11-01", "2027-01-30")).toEqual({
      ok: false,
      errors: { sprint_end: "Must be at most 90 days long." },
    });
  });

  it("reports a bad date without also reporting the pair rule", () => {
    expect(validateSprint("2026-02-30", null)).toEqual({
      ok: false,
      errors: { sprint_start: "Enter a valid date." },
    });
  });
});
