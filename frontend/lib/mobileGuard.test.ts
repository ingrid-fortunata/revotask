// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// AUTH-AC13.6, FE-S4. A heuristic scan that keeps mobile-hostile patterns out of every slice. It
// catches regressions. It does not prove a layout works: that is the real-browser check
// (AUTH-AC13.1, AUTH-AC13.2) and Playwright in T15. A deliberate exception needs an edit here,
// which a reviewer will see.
const ROOT = process.cwd();
const SCANNED_DIRS = ["app", "components", "hooks"];
const MAX_FIXED_WIDTH_PX = 320;

const PATTERNS: { name: string; test: (source: string) => boolean }[] = [
  { name: "h-screen", test: (s) => /(?<![\w-])h-screen\b/.test(s) },
  { name: "min-h-screen", test: (s) => /(?<![\w-])min-h-screen\b/.test(s) },
  { name: "100vh", test: (s) => /\b100vh\b/.test(s) },
  { name: "user-scalable / userScalable", test: (s) => /user-?scalable/i.test(s) },
  { name: "maximum-scale / maximumScale", test: (s) => /maximum-?scale/i.test(s) },
  {
    name: `an unprefixed fixed width above ${MAX_FIXED_WIDTH_PX}px (w-[…px], min-w-[…px])`,
    test: (s) =>
      [...s.matchAll(/(?<![\w:-])(?:min-)?w-\[(\d+)px\]/g)].some(
        (match) => Number(match[1]) > MAX_FIXED_WIDTH_PX,
      ),
  },
];

/** Drop comments so a note that explains a rule does not trip it. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function findViolations(source: string): string[] {
  const code = stripComments(source);
  return PATTERNS.filter((pattern) => pattern.test(code)).map((pattern) => pattern.name);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (/\.test\.[tj]sx?$/.test(entry.name)) return [];
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

describe("the guard patterns", () => {
  it.each([
    ['<body className="min-h-screen">', "min-h-screen"],
    ['<div className="h-screen">', "h-screen"],
    ["height: 100vh;", "100vh"],
    ['<meta name="viewport" content="width=device-width, user-scalable=no">', "user-scalable / userScalable"],
    ["export const viewport = { maximumScale: 1 };", "maximum-scale / maximumScale"],
    ['<div className="w-[400px]">', "an unprefixed fixed width"],
    ['<div className="min-w-[640px]">', "an unprefixed fixed width"],
    ['<div className="flex w-[321px]">', "an unprefixed fixed width"],
  ])("flags %s", (source, name) => {
    expect(findViolations(source).join(" ")).toContain(name);
  });

  it.each([
    '<body className="min-h-dvh">',
    '<div className="w-full max-w-md">',
    '<div className="max-w-[50vw]">',
    '<div className="w-[320px]">',
    '<div className="sm:w-[400px] md:min-w-[640px]">',
    '<div className="max-w-[640px]">',
    "// never use h-screen or 100vh here",
    "/* min-h-screen is banned */ const x = 1;",
    '<div className="top-screen">',
  ])("accepts %s", (source) => {
    expect(findViolations(source)).toEqual([]);
  });
});

describe("the real source tree", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it("scans the app, components and hooks", () => {
    const names = files.map((file) => file.replace(ROOT, ""));
    expect(names).toEqual(expect.arrayContaining(["/app/layout.tsx", "/components/shared/FormField.tsx", "/app/globals.css"]));
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files.map((file) => [file.replace(ROOT, ""), file]))("%s has no mobile-hostile pattern", (_name, file) => {
    expect(findViolations(readFileSync(file, "utf8"))).toEqual([]);
  });
});
