import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest runs without globals, so React Testing Library does not unmount between tests alone.
afterEach(() => cleanup());

// `server-only` throws outside the Next.js server build. Tests of server modules run in
// plain Node, so the guard is replaced with an empty module here (DD10).
vi.mock("server-only", () => ({}));

// jsdom has no matchMedia, which react-hot-toast reads for reduced-motion. No query matches.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
