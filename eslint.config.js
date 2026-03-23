import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      ".claude/",
      "design/",
      "**/*.js",
      "!eslint.config.js",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended (type-aware off — faster)
  ...tseslint.configs.recommended,

  // Prettier — disables formatting rules that conflict
  eslintConfigPrettier,

  // Shared rules for all TS files
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },

  // Server — relax console & require rules
  {
    files: ["server/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Config files — allow require()
  {
    files: ["*.config.{ts,js}", "client/vite.config.ts", "drizzle.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Test files — relax rules
  {
    files: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/e2e/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
    },
  },

  // React-specific rules (client only)
  {
    files: ["client/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
