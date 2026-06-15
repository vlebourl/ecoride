import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@ecoride/shared": path.resolve(__dirname, "../shared"),
    },
  },
  test: {
    globals: true,
    exclude: ["node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Risk surfaces: business logic (lib), request validation (validators),
      // authorization (auth), and HTTP handlers (routes). Declarative schema,
      // bootstrap (index/env), cron wiring and type-only files are excluded
      // so the numbers reflect code that can actually carry a regression.
      include: ["src/lib/**", "src/validators/**", "src/auth/**", "src/routes/**"],
      thresholds: {
        statements: 72,
        branches: 62,
        functions: 72,
        lines: 72,
      },
    },
  },
});
