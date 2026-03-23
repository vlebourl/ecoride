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
  },
});
