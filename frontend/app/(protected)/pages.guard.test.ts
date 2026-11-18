// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// AUTH-AC11.9, C6. The (protected) layout is not the authorization boundary, so every page under
// it must verify the session itself. A new page that skips the check fails this test.
const ROOT = join(process.cwd(), "app", "(protected)");

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return /^page\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("protected pages verify the session", () => {
  const pages = pageFiles(ROOT);

  it("finds the protected home page", () => {
    expect(pages.map((p) => p.replace(ROOT, ""))).toContain("/page.tsx");
  });

  it.each(pages.map((p) => [p.replace(ROOT, ""), p]))("%s imports and calls the session helper", (_name, path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toMatch(/from "@\/lib\/server\/session"/);
    expect(source).toMatch(/\b(getCurrentUser|fetchPrivate)\(/);
  });

  it("keeps the session check in the layout, above loading.tsx, so redirect() still sends an HTTP 307", () => {
    const layout = readFileSync(join(ROOT, "layout.tsx"), "utf8");
    expect(layout).toMatch(/await getCurrentUser\(\)/);
    expect(readdirSync(ROOT)).toContain("loading.tsx");
  });
});

describe("the guard itself", () => {
  it("would fail for a page without the helper", () => {
    const bad = "export default function Page() { return null }";
    expect(bad).not.toMatch(/\b(getCurrentUser|fetchPrivate)\(/);
  });
});
