import { describe, expect, it } from "vitest";
import { initials } from "./Avatar";

describe("initials", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["ada", "A"],
    ["  grace   brewster  hopper ", "GH"],
    ["😀 Smile", "😀S"],
    ["   ", "?"],
  ])("turns %j into %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
