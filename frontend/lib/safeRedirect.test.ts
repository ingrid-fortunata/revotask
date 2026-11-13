import { describe, expect, it } from "vitest";
import { safeLocalPath, safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/boards/abc", "/boards/abc"],
    ["/boards/abc?x=1&y=2", "/boards/abc?x=1&y=2"],
    ["/boards/abc#top", "/boards/abc"],
    ["/my-tasks", "/my-tasks"],
    ["/loginx", "/loginx"],
  ])("accepts %s as %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    ["//evil.example", "scheme-relative host"],
    ["//evil.example/path", "scheme-relative host with a path"],
    ["/\\evil.example", "backslash host"],
    ["\\\\evil.example", "double backslash"],
    ["https://evil.example", "an absolute URL"],
    ["http://localhost:3000/boards", "an absolute URL on this site"],
    ["javascript:alert(1)", "a javascript URL"],
    ["data:text/html,x", "a data URL"],
    ["boards/abc", "a relative path without a slash"],
    ["/boards/abc\nSet-Cookie: x=1", "a newline"],
    ["/boards/\tabc", "a tab"],
    ["/boards/\u0000abc", "a null byte"],
    ["/boards/\u007fabc", "a delete character"],
    ["/login", "the login page"],
    ["/login/", "the login page with a slash"],
    ["/login?x=1", "the login page with a query"],
    ["/register", "the register page"],
    ["", "an empty value"],
    ["/" + "a".repeat(2048), "a value over 2,048 characters"],
  ])("returns / for %j (%s)", (input) => {
    expect(safeRedirectPath(input)).toBe("/");
  });

  it.each([undefined, null, 5, true, [], ["/boards"], {}])("returns / for the non-string %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/");
  });

  it("accepts a value of exactly 2,048 characters", () => {
    const value = "/" + "a".repeat(2047);
    expect(safeRedirectPath(value)).toBe(value);
  });

  it("never returns a URL", () => {
    for (const input of ["/a", "/a?b=https://evil.example", "/a?next=//evil.example"]) {
      const out = safeRedirectPath(input);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
    }
  });
});

describe("safeLocalPath", () => {
  it("allows the login page so the session-expired redirect can reach it", () => {
    expect(safeLocalPath("/login")).toBe("/login");
    expect(safeLocalPath("/login?next=%2Fboards%2Fabc")).toBe("/login?next=%2Fboards%2Fabc");
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/a\nb", "", undefined])(
    "still rejects %j",
    (input) => {
      expect(safeLocalPath(input)).toBe("/");
    },
  );
});
