// Field rules for the register and login forms. They mirror backend/app/blueprints/auth/schema.py
// (design 4.4, AUTH-AC10.7). Both sides run specs/fixtures/auth-field-cases.json in their tests,
// so a difference fails a test. Flask stays authoritative. Lengths count Unicode code points,
// which is why there are no minLength or maxLength attributes (they count UTF-16 units).

export const NAME_MAX = 80;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8; // register only; login accepts 1 to 10 (AUTH-AC2.4)
export const PASSWORD_MAX = 10; // revision 5 (C12); was 128

export const MESSAGES = {
  required: "Required.",
  notText: "Must be text.",
  unknown: "Unknown field.",
  nameLength: `Must be 1 to ${NAME_MAX} characters.`,
  emailLength: `Must be at most ${EMAIL_MAX} characters.`,
  emailFormat: "Enter a valid email address.",
  registerPasswordLength: `Must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`,
  passwordComposition: "Must include an uppercase letter, a lowercase letter and a special character.",
  loginPasswordLength: `Must be 1 to ${PASSWORD_MAX} characters.`,
} as const;

// The same expression as the Python schema, matched against the whole normalized value.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password composition, ASCII only (the same ranges as backend/app/blueprints/auth/schema.py).
// Special characters are ASCII punctuation: 0x21-0x2F, 0x3A-0x40, 0x5B-0x60, 0x7B-0x7E.
// A space is not special, and accented letters and emoji do not count.
export const PASSWORD_UPPERCASE = /[A-Z]/;
export const PASSWORD_LOWERCASE = /[a-z]/;
export const PASSWORD_SPECIAL = /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/;

/** The hint shown under the register password field. It states the same rules as the messages. */
export const PASSWORD_HINT =
  "8 to 10 characters, with an uppercase letter, a lowercase letter and a special character such as ! ? # or %.";

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
const passwordComposition: Rule = (value) =>
  PASSWORD_UPPERCASE.test(value) && PASSWORD_LOWERCASE.test(value) && PASSWORD_SPECIAL.test(value)
    ? null
    : MESSAGES.passwordComposition;
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
    // Length first, then composition: the first failing message is reported, like Flask.
    rules: [
      lengthBetween(PASSWORD_MIN, PASSWORD_MAX, MESSAGES.registerPasswordLength),
      passwordComposition,
    ],
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

// `partial` is for a profile update: a key that is absent is not an error and not in the body.
function validate<K extends string>(
  spec: Record<K, FieldSpec>,
  raw: Record<string, unknown>,
  partial = false,
): Validated<K> {
  const keys = Object.keys(spec) as K[];
  const body = {} as Record<K, string>;
  const problems: [string, string][] = [];

  // Entries and Object.fromEntries, not `fields[key] = ...`: a "__proto__" key would vanish.
  for (const key of Object.keys(raw)) {
    if (!keys.includes(key as K)) problems.push([key, MESSAGES.unknown]);
  }
  for (const key of keys) {
    if (partial && !Object.hasOwn(raw, key)) continue;
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

export const PROFILE_FIELDS = ["name", "current_password", "new_password"] as const;
export type ProfileKey = (typeof PROFILE_FIELDS)[number];
export const PASSWORD_PAIR = ["current_password", "new_password"] as const;

// E31 (Revision 2): the name follows the E02 name rule, the new password the register rule and the
// current password the login rule (P17). The email is the fixed login key, so it is not here and
// an `email` key is "Unknown field." like on Flask (P12). Flask stays authoritative.
const PROFILE_SPEC: Record<ProfileKey, FieldSpec> = {
  name: REGISTER_SPEC.name,
  current_password: LOGIN_SPEC.password,
  new_password: REGISTER_SPEC.password,
};

/**
 * The values the form sends (P7, P13): `name` when its normalized value differs from the saved
 * one, and each password key only when its field holds text. An empty password field is "not
 * sent", so a half pair reaches `validateProfile`, which reports `Required.` for the empty half.
 */
export function profileChanges(
  values: Record<ProfileKey, string>,
  savedName: string,
): Partial<Record<ProfileKey, string>> {
  const changes: Partial<Record<ProfileKey, string>> = {};
  if (PROFILE_SPEC.name.normalize(values.name) !== PROFILE_SPEC.name.normalize(savedName)) {
    changes.name = values.name;
  }
  for (const key of PASSWORD_PAIR) {
    if (values[key] !== "") changes[key] = values[key];
  }
  return changes;
}

/**
 * Validate and normalize the keys present in `raw`. An unknown key is "Unknown field.", an absent
 * key is fine, and when exactly one password key is present the other is "Required." (the pairing
 * rule of Flask, P13).
 */
export function validateProfile(raw: Record<string, unknown>) {
  const result = validate(PROFILE_SPEC, raw, true);
  const present = PASSWORD_PAIR.filter((key) => Object.hasOwn(raw, key));
  if (present.length === 1) {
    const missing = PASSWORD_PAIR.find((key) => !present.includes(key))!;
    result.fields[missing] = MESSAGES.required;
  }
  return result;
}
