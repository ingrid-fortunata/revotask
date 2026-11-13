// Field rules for the register and login forms. They mirror backend/app/blueprints/auth/schema.py
// (design 4.4, AUTH-AC10.7). Both sides run specs/fixtures/auth-field-cases.json in their tests,
// so a difference fails a test. Flask stays authoritative. Lengths count Unicode code points,
// which is why there are no minLength or maxLength attributes (they count UTF-16 units).

export const NAME_MAX = 80;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const MESSAGES = {
  required: "Required.",
  notText: "Must be text.",
  unknown: "Unknown field.",
  nameLength: `Must be 1 to ${NAME_MAX} characters.`,
  emailLength: `Must be at most ${EMAIL_MAX} characters.`,
  emailFormat: "Enter a valid email address.",
  registerPasswordLength: `Must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`,
  loginPasswordLength: `Must be 1 to ${PASSWORD_MAX} characters.`,
} as const;

// The same expression as the Python schema, matched against the whole normalized value.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const REGISTER_FIELDS = ["name", "email", "password"] as const;
export const LOGIN_FIELDS = ["email", "password"] as const;

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function normalizeName(value: string): string {
  return value.trim();
}

/** The only place the UI trims and lowercases an email. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type Validated<K extends string> = { body: Record<K, string>; fields: FieldErrors<K> };

type Rule = (value: string) => string | null;
type FieldSpec = { normalize: (value: string) => string; rules: Rule[] };

const lengthBetween = (min: number, max: number, message: string): Rule => (value) => {
  const length = codePointLength(value);
  return length < min || length > max ? message : null;
};

const notBlank: Rule = (value) => (value === "" ? MESSAGES.required : null);
const emailFormat: Rule = (value) => (EMAIL_PATTERN.test(value) ? null : MESSAGES.emailFormat);
const identity = (value: string) => value;

const REGISTER_SPEC: Record<(typeof REGISTER_FIELDS)[number], FieldSpec> = {
  name: { normalize: normalizeName, rules: [lengthBetween(1, NAME_MAX, MESSAGES.nameLength)] },
  email: {
    normalize: normalizeEmail,
    rules: [lengthBetween(0, EMAIL_MAX, MESSAGES.emailLength), emailFormat],
  },
  password: {
    normalize: identity, // the password is never trimmed
    rules: [lengthBetween(PASSWORD_MIN, PASSWORD_MAX, MESSAGES.registerPasswordLength)],
  },
};

const LOGIN_SPEC: Record<(typeof LOGIN_FIELDS)[number], FieldSpec> = {
  email: {
    normalize: normalizeEmail,
    rules: [notBlank, lengthBetween(0, EMAIL_MAX, MESSAGES.emailLength)],
  },
  password: {
    normalize: identity,
    rules: [lengthBetween(1, PASSWORD_MAX, MESSAGES.loginPasswordLength)],
  },
};

function validate<K extends string>(spec: Record<K, FieldSpec>, raw: Record<string, unknown>): Validated<K> {
  const keys = Object.keys(spec) as K[];
  const body = {} as Record<K, string>;
  const problems: [string, string][] = [];

  // Entries and Object.fromEntries, not `fields[key] = ...`: a "__proto__" key would vanish.
  for (const key of Object.keys(raw)) {
    if (!keys.includes(key as K)) problems.push([key, MESSAGES.unknown]);
  }
  for (const key of keys) {
    const value = Object.hasOwn(raw, key) ? raw[key] : undefined;
    if (value === undefined || value === null) {
      problems.push([key, MESSAGES.required]);
      continue;
    }
    if (typeof value !== "string") {
      problems.push([key, MESSAGES.notText]);
      continue;
    }
    const normalized = spec[key].normalize(value);
    body[key] = normalized;
    for (const rule of spec[key].rules) {
      const message = rule(normalized);
      if (message) {
        problems.push([key, message]);
        break; // the first failing rule is the one reported, like Flask
      }
    }
  }
  return { body, fields: Object.fromEntries(problems) as FieldErrors<K> };
}

export function validateRegister(raw: Record<string, unknown>) {
  return validate(REGISTER_SPEC, raw);
}

export function validateLogin(raw: Record<string, unknown>) {
  return validate(LOGIN_SPEC, raw);
}
