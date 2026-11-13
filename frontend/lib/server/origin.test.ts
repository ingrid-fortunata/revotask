// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkOrigin } from "./origin";

const APP = "http://localhost:3000";
const withOrigin = (origin?: string) =>
  new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: origin === undefined ? {} : { origin },
  });

describe("checkOrigin", () => {
  it("accepts the exact configured origin", () => {
    expect(checkOrigin(withOrigin(APP), APP)).toBe(true);
  });

  it.each([
    [undefined, "an absent header"],
    ["null", "the literal null origin"],
    ["", "an empty header"],
    ["https://localhost:3000", "a different scheme"],
    ["http://localhost:3001", "a different port"],
    ["http://127.0.0.1:3000", "a different host"],
    ["http://localhost:3000/", "a trailing slash"],
    ["http://localhost:3000.evil.example", "a suffix trick"],
    ["http://evil.example", "another site"],
    ["HTTP://LOCALHOST:3000", "different letter case"],
  ] as [string | undefined, string][])("rejects %s (%s)", (origin) => {
    expect(checkOrigin(withOrigin(origin), APP)).toBe(false);
  });
});
