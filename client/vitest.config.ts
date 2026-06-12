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
      include: ["src/lib/**", "src/hooks/**", "src/pages/**"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.test.*",
        "src/pages/NotFoundPage.tsx",
        "src/pages/PrivacyPage.tsx",
      ],
      thresholds: {
        statements: 61,
        branches: 54,
        functions: 48,
        lines: 62,
      },
    },
  },
});
