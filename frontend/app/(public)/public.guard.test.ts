// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// AUTH-AC10.5. /login and /register never read the session cookie and never redirect, so a stale
// or tampered cookie cannot cause a redirect loop, and a signed-in visitor still sees the form.
const ROOT = join(process.cwd(), "app", "(public)");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

describe("public pages do not depend on the session", () => {
  const files = sources(ROOT);

  it("finds the layout and both pages", () => {
    expect(files.map((f) => f.replace(ROOT, "")).sort()).toEqual(["/layout.tsx", "/login/page.tsx", "/register/page.tsx"]);
  });

  it.each(files.map((f) => [f.replace(ROOT, ""), f]))("%s has no cookie, session or redirect call", (_name, file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/next\/headers|cookies\(|@\/lib\/server\/session|getCurrentUser|fetchPrivate|redirect\(/);
  });
});
