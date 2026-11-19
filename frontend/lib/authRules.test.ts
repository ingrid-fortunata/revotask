// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  codePointLength,
  LOGIN_FIELDS,
  MESSAGES,
  normalizeEmail,
  normalizeName,
  REGISTER_FIELDS,
  PROFILE_FIELDS,
  profileChanges,
  validateLogin,
  validateProfile,
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
) as Record<"register" | "login" | "profile", { base: Record<string, unknown>; cases: Case[] }>;

function runCases(
  form: "register" | "login" | "profile",
  validate: (raw: Record<string, unknown>) => { body: Record<string, string>; fields: Record<string, string> },
  keys: readonly string[] | null,
) {
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
        // A profile body holds only the keys that were sent (a partial update).
        expect(Object.keys(result.body).sort()).toEqual([...(keys ?? Object.keys(body))].sort());
        for (const [name, value] of Object.entries(expected.accepted ?? {})) {
          expect(result.body[name]).toBe(value);
        }
      }
    });
  });
}

runCases("register", validateRegister, REGISTER_FIELDS);
runCases("login", validateLogin, LOGIN_FIELDS);
runCases("profile", validateProfile, null);

describe("profile rules", () => {
  const blank = { name: "Ada Lovelace", current_password: "", new_password: "" };

  it("lists the profile fields: the name and the password pair, never the email", () => {
    expect([...PROFILE_FIELDS]).toEqual(["name", "current_password", "new_password"]);
  });

  it("sends nothing when the name is unchanged after trimming and no password is typed", () => {
    expect(profileChanges({ ...blank, name: "  Ada Lovelace " }, "Ada Lovelace")).toEqual({});
  });

  it("sends the name only when it changed, as typed (the caller normalizes through validateProfile)", () => {
    expect(profileChanges({ ...blank, name: "Grace" }, "Ada Lovelace")).toEqual({ name: "Grace" });
  });

  it("sends each password key only when its field holds text", () => {
    expect(profileChanges({ ...blank, current_password: "Old#pass1", new_password: "New#pass2" }, "Ada Lovelace")).toEqual({
      current_password: "Old#pass1",
      new_password: "New#pass2",
    });
    expect(profileChanges({ ...blank, current_password: "Old#pass1" }, "Ada Lovelace")).toEqual({
      current_password: "Old#pass1",
    });
    expect(profileChanges({ ...blank, new_password: "New#pass2" }, "Ada Lovelace")).toEqual({
      new_password: "New#pass2",
    });
  });

  it("keeps spaces in a password and sends a space-only password", () => {
    expect(profileChanges({ ...blank, current_password: "   " }, "Ada Lovelace")).toEqual({ current_password: "   " });
  });

  it("sends the name and the pair together", () => {
    expect(
      profileChanges({ name: "Grace", current_password: "Old#pass1", new_password: "New#pass2" }, "Ada Lovelace"),
    ).toEqual({ name: "Grace", current_password: "Old#pass1", new_password: "New#pass2" });
  });

  it("validates a partial body: an absent key is not an error, an unknown key is", () => {
    expect(validateProfile({})).toEqual({ body: {}, fields: {} });
    expect(validateProfile({ name: "  Grace " })).toEqual({ body: { name: "Grace" }, fields: {} });
    expect(validateProfile({ password: "x" }).fields).toEqual({ password: "Unknown field." });
  });

  it("rejects the email as an unknown key, alone and beside valid fields", () => {
    expect(validateProfile({ email: "ada@example.com" }).fields).toEqual({ email: "Unknown field." });
    expect(validateProfile({ name: "Ada", email: "ada@example.com" }).fields).toEqual({ email: "Unknown field." });
  });

  it("reports Required. on the missing half of the password pair, also beside another error", () => {
    expect(validateProfile({ new_password: "New#pass2" }).fields).toEqual({ current_password: "Required." });
    expect(validateProfile({ current_password: "Old#pass1" }).fields).toEqual({ new_password: "Required." });
    expect(validateProfile({ current_password: "x".repeat(11) }).fields).toEqual({
      current_password: "Must be 1 to 10 characters.",
      new_password: "Required.",
    });
  });

  it("applies the register rule to the new password and the login rule to the current one", () => {
    expect(validateProfile({ current_password: "password", new_password: "short" }).fields).toEqual({
      new_password: "Must be 8 to 10 characters.",
    });
    expect(validateProfile({ current_password: "password", new_password: "Aa1!aaaa" }).fields).toEqual({});
  });

  it("never trims a password", () => {
    const result = validateProfile({ current_password: " Old#p1 ", new_password: " New#p2a " });
    expect(result.body).toEqual({ current_password: " Old#p1 ", new_password: " New#p2a " });
  });
});

describe("normalization and lengths", () => {
  it("trims names and trims and lowercases emails, but never touches the password", () => {
    expect(normalizeName("  Ada  Lovelace ")).toBe("Ada  Lovelace");
    expect(normalizeEmail("  Ada@Example.COM\t")).toBe("ada@example.com");
    const result = validateRegister({ name: "A", email: "a@b.co", password: " Sp 1!aB " });
    expect(result.body.password).toBe(" Sp 1!aB ");
    expect(result.fields).toEqual({});
  });

  it("counts code points, not UTF-16 units", () => {
    expect("😀".length).toBe(2);
    expect(codePointLength("😀")).toBe(1);
    expect(codePointLength("a😀b")).toBe(3);
  });

  it("reports only the first failing message per field", () => {
    expect(validateRegister({ name: "A", email: "x".repeat(300), password: "Horse-4Bat" }).fields).toEqual({
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
    expect(Object.keys(validateRegister({ name: "Ada", email: "a@b.co", password: "Horse-4Bat" }).body)).toEqual(["name", "email", "password"]);
  });
});

describe("password composition", () => {
  const register = (password: string) => validateRegister({ name: "Ada", email: "a@b.co", password });

  it("requires an uppercase letter, a lowercase letter and an ASCII special character", () => {
    expect(register("Aa1!aaaa").fields).toEqual({});
    expect(register("aa1!aaaa").fields).toEqual({ password: MESSAGES.passwordComposition });
    expect(register("AA1!AAAA").fields).toEqual({ password: MESSAGES.passwordComposition });
    expect(register("Aa1aaaaa").fields).toEqual({ password: MESSAGES.passwordComposition });
  });

  it("reports the length message first when both rules fail", () => {
    expect(register("abc").fields).toEqual({ password: "Must be 8 to 10 characters." });
    expect(register("").fields).toEqual({ password: "Must be 8 to 10 characters." });
  });

  it("does not count a space, an accented letter or an emoji as special", () => {
    for (const filler of [" ", "é", "€", "😀"]) {
      expect(register(`Aa1${filler}aaaa`).fields).toEqual({ password: MESSAGES.passwordComposition });
    }
  });

  it("counts every ASCII punctuation character as special", () => {
    for (const special of "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~") {
      expect(register(`Aa1${special}aaaa`).fields).toEqual({});
    }
  });

  it("does not apply the register rules to login", () => {
    expect(validateLogin({ email: "a@b.co", password: "abc" }).fields).toEqual({});
  });
});
