// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  clearedSessionCookie,
  SESSION_COOKIE,
  serializeCookie,
  sessionCookie,
  sessionMaxAge,
} from "./sessionCookie";

function token(payload: unknown): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.sig`;
}

describe("sessionCookie", () => {
  it("is host-only, HttpOnly, SameSite=Lax and Path=/", () => {
    const cookie = sessionCookie("abc", 3000, false);
    expect(cookie).toEqual({
      name: "revotask_session",
      value: "abc",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3000,
      secure: false,
    });
    expect(cookie).not.toHaveProperty("domain");
    expect(SESSION_COOKIE).toBe("revotask_session");
  });

  it("is Secure when asked", () => {
    expect(sessionCookie("abc", 10, true).secure).toBe(true);
  });

  it("clears with Max-Age 0 and the same Path, SameSite and Secure", () => {
    for (const secure of [false, true]) {
      const cleared = clearedSessionCookie(secure);
      expect(cleared).toMatchObject({ value: "", maxAge: 0, path: "/", sameSite: "lax", secure, httpOnly: true });
      expect(cleared).not.toHaveProperty("domain");
    }
  });
});

describe("serializeCookie", () => {
  it("writes the exact attributes and no Domain", () => {
    expect(serializeCookie(sessionCookie("a.b.c", 3000, false))).toBe(
      "revotask_session=a.b.c; Path=/; Max-Age=3000; HttpOnly; SameSite=Lax",
    );
  });

  it("adds Secure only when asked", () => {
    expect(serializeCookie(sessionCookie("t", 5, true))).toMatch(/; Secure$/);
    expect(serializeCookie(sessionCookie("t", 5, false))).not.toMatch(/Secure/);
  });

  it("clears with Max-Age=0 and an empty value", () => {
    expect(serializeCookie(clearedSessionCookie(true))).toBe(
      "revotask_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
    );
  });
});

describe("sessionMaxAge", () => {
  const now = 1_000_000;

  it("uses expires_in when the token outlives it", () => {
    expect(sessionMaxAge(3600, token({ exp: now + 7200 }), now)).toBe(3600);
  });

  it("uses the remaining token life when that is shorter, rounded down", () => {
    expect(sessionMaxAge(3600, token({ exp: now + 3598.9 }), now)).toBe(3598);
    expect(sessionMaxAge(3600, token({ exp: now + 30 }), now)).toBe(30);
  });

  it.each([0, -1, 1.5, 86_401, "3600", null, undefined, Number.NaN])(
    "rejects expires_in %j",
    (value) => {
      expect(sessionMaxAge(value, token({ exp: now + 3600 }), now)).toBeNull();
    },
  );

  it.each([
    ["not.a.token.at.all", "too many parts"],
    ["onlyone", "one part"],
    ["a..c", "an empty part"],
    [`${Buffer.from("{").toString("base64url")}.${Buffer.from("not json").toString("base64url")}.s`, "payload not JSON"],
    [token({}), "no exp"],
    [token({ exp: "soon" }), "a non-numeric exp"],
    [token({ exp: now - 10 }), "an exp in the past"],
    [token({ exp: now + 0.5 }), "less than one second left"],
  ])("rejects a token with %s (%s)", (value) => {
    expect(sessionMaxAge(3600, value, now)).toBeNull();
  });
});
