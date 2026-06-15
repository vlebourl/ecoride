import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify("test"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Risk surfaces: pure logic (lib) and stateful hooks incl. the React
      // Query data layer (hooks). View-only pages/components are left out for
      // now — they are exercised by Playwright e2e, and including them would
      // force artificially low thresholds dominated by untested JSX branches.
      include: ["src/lib/**", "src/hooks/**"],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 76,
        lines: 72,
      },
    },
  },
});
