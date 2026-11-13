// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  codePointLength,
  LOGIN_FIELDS,
  normalizeEmail,
  normalizeName,
  REGISTER_FIELDS,
  validateLogin,
  validateRegister,
} from "./authRules";

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

type Case = { id: string; set: Record<string, unknown>; drop: string[]; expect: { accepted?: Record<string, unknown>; fields?: Record<string, string> } };
const file = JSON.parse(
  readFileSync(join(process.cwd(), "..", "specs", "fixtures", "auth-field-cases.json"), "utf8"),
) as Record<"register" | "login", { base: Record<string, unknown>; cases: Case[] }>;

function runCases(form: "register" | "login", validate: (raw: Record<string, unknown>) => { body: Record<string, string>; fields: Record<string, string> }, keys: readonly string[]) {
  const { base, cases } = file[form];
  describe(`${form} shared cases`, () => {
    it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
      const body: Record<string, unknown> = { ...(expand(base) as object), ...(expand(c.set) as object) };
      for (const key of c.drop) delete body[key];
      const result = validate(body);
      const expected = expand(c.expect) as Case["expect"];
      if (expected.fields) {
        expect(result.fields).toEqual(expected.fields);
      } else {
        expect(result.fields).toEqual({});
        expect(Object.keys(result.body).sort()).toEqual([...keys].sort());
        for (const [name, value] of Object.entries(expected.accepted ?? {})) {
          expect(result.body[name]).toBe(value);
        }
      }
    });
  });
}

runCases("register", validateRegister, REGISTER_FIELDS);
runCases("login", validateLogin, LOGIN_FIELDS);

describe("normalization and lengths", () => {
  it("trims names and trims and lowercases emails, but never touches the password", () => {
    expect(normalizeName("  Ada  Lovelace ")).toBe("Ada  Lovelace");
    expect(normalizeEmail("  Ada@Example.COM\t")).toBe("ada@example.com");
    const result = validateRegister({ name: "A", email: "a@b.co", password: "  spaced password  " });
    expect(result.body.password).toBe("  spaced password  ");
    expect(result.fields).toEqual({});
  });

  it("counts code points, not UTF-16 units", () => {
    expect("😀".length).toBe(2);
    expect(codePointLength("😀")).toBe(1);
    expect(codePointLength("a😀b")).toBe(3);
  });

  it("reports only the first failing message per field", () => {
    expect(validateRegister({ name: "A", email: "x".repeat(300), password: "p".repeat(12) }).fields).toEqual({
      email: "Must be at most 254 characters.",
    });
  });

  it("treats a __proto__ key as an unknown field", () => {
    const raw = JSON.parse('{"email":"a@b.co","password":"x","__proto__":{"x":1}}');
    const { fields } = validateLogin(raw);
    expect(Object.keys(fields)).toEqual(["__proto__"]);
    expect(Object.getOwnPropertyDescriptor(fields, "__proto__")?.value).toBe("Unknown field.");
  });

  it("returns a body with exactly the form's keys when the input is valid", () => {
    const login = validateLogin({ email: " A@B.Co ", password: "x" });
    expect(login.body).toEqual({ email: "a@b.co", password: "x" });
    expect(Object.keys(validateRegister({ name: "Ada", email: "a@b.co", password: "p".repeat(12) }).body)).toEqual(["name", "email", "password"]);
  });
});
