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
      include: ["src/lib/**", "src/routes/**", "src/validators/**", "src/auth/**"],
      exclude: ["src/**/__tests__/**", "src/**/*.test.*", "src/routes/index.ts"],
      thresholds: {
        statements: 70,
        branches: 63,
        functions: 70,
        lines: 70,
      },
    },
  },
});
