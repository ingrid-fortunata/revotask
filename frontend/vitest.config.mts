import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component tests run in jsdom. Route Handler and server module tests opt in to the node
// environment with a `// @vitest-environment node` comment. Async Server Components and
// browser flows are covered by the HTTP smoke here and by Playwright in T15 (assumption A5).
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same mapping as "paths" in tsconfig.json: "@/*" is the project root.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["{app,components,hooks,lib}/**/*.test.{ts,tsx}"],
  },
});
