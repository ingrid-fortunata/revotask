// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCardTitle, validateColumnName, validateDescription } from "./kanbanRules";

// Client half of the parity check with backend/tests/test_kanban_schema.py. Both read
// specs/fixtures/kanban-field-cases.json, so a rule that differs on one side fails a test there.

type Json = Record<string, unknown>;
type Case = { id: string; set: Json; drop: string[]; expect: { accepted?: Json; fields?: Record<string, string> } };
type Form = { base: Json; cases: Case[] };

function expand(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Json;
    if ("repeat" in record && "times" in record) return String(record.repeat).repeat(Number(record.times));
  }
  return value;
}

const file = JSON.parse(
  readFileSync(join(process.cwd(), "..", "specs", "fixtures", "kanban-field-cases.json"), "utf8"),
) as Record<string, Form>;

function bodyFor(form: Form, c: Case): Json {
  const body: Json = { ...form.base, ...c.set };
  for (const key of c.drop) delete body[key];
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, expand(v)]));
}

// Cases that set the field under test and expect a message or an accepted value for it.
function casesFor(formName: string, field: string): Case[] {
  return file[formName].cases.filter(
    (c) => field in c.set && (field in (c.expect.fields ?? {}) || field in (c.expect.accepted ?? {})),
  );
}

type Rule = (raw: unknown) => { ok: boolean; value?: unknown; error?: string };

function run(formName: string, field: string, rule: Rule) {
  const cases = casesFor(formName, field);
  it(`runs the ${formName} ${field} cases in the fixture`, () => {
    expect(cases.length).toBeGreaterThan(0);
  });
  it.each(cases.map((c) => [c.id, c] as const))(`${formName} ${field}: %s`, (_id, c) => {
    const result = rule(bodyFor(file[formName], c)[field]);
    if (c.expect.fields) {
      expect(result).toEqual({ ok: false, error: c.expect.fields[field] });
    } else {
      expect(result).toEqual({ ok: true, value: expand(c.expect.accepted?.[field]) });
    }
  });
}

describe("Feature: kanban, Property 2: client rules match kanban-field-cases.json", () => {
  run("column_create", "name", validateColumnName);
  run("column_update", "name", validateColumnName);
  run("card_create", "title", validateCardTitle);
  run("card_update", "title", validateCardTitle);
  run("card_create", "description", validateDescription);
  run("card_update", "description", validateDescription);
});

describe("kanbanRules", () => {
  it("treats an empty or blank value as a length error, like the server", () => {
    expect(validateColumnName("")).toEqual({ ok: false, error: "Must be 1 to 80 characters." });
    expect(validateCardTitle("  ")).toEqual({ ok: false, error: "Must be 1 to 160 characters." });
  });

  it("counts code points, not UTF-16 units", () => {
    expect(validateColumnName("😀".repeat(80)).ok).toBe(true);
    expect(validateColumnName("😀".repeat(81)).ok).toBe(false);
    expect(validateDescription("😀".repeat(2000)).ok).toBe(true);
    expect(validateDescription("😀".repeat(2001)).ok).toBe(false);
  });

  it("turns a missing or blank description into null", () => {
    expect(validateDescription(undefined)).toEqual({ ok: true, value: null });
    expect(validateDescription("  \n ")).toEqual({ ok: true, value: null });
  });
});
