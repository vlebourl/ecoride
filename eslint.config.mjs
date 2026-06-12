import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import eslintConfigPrettier from "eslint-config-prettier";

const createRestrictedImportRule = (patterns) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns,
    },
  ],
});

const CLIENT_PAGE_IMPORT_PATTERNS = [
  {
    group: ["@/pages/*"],
    message: "Les pages restent des entrées de routage, pas des dépendances réutilisables.",
  },
  {
    regex: "^\\.\\.?/(?:.*?/)?pages(?:/|$)",
    message: "Les pages restent des entrées de routage, pas des dépendances réutilisables.",
  },
];

const CLIENT_COMPONENT_IMPORT_PATTERNS = [
  {
    group: ["@/components/*"],
    message: "Les hooks et libs réutilisables ne doivent pas dépendre des composants UI.",
  },
  {
    regex: "^\\.\\.?/(?:.*?/)?components(?:/|$)",
    message: "Les hooks et libs réutilisables ne doivent pas dépendre des composants UI.",
  },
];

const SERVER_ROUTE_IMPORT_PATTERNS = [
  {
    regex: "^\\.\\.(?:/\\.\\.)*/routes(?:/|$)",
    message:
      "Les routes sont la couche transport HTTP; déplace la logique partagée vers lib/auth/validators/db.",
  },
];

const SERVER_HIGH_LEVEL_IMPORT_PATTERNS = [
  {
    regex: "^\\.\\.(?:/\\.\\.)*/routes(?:/|$)",
    message: "Le module db doit rester bas niveau et ne pas dépendre des routes.",
  },
  {
    regex: "^\\.\\.(?:/\\.\\.)*/validators(?:/|$)",
    message: "Le module db doit rester bas niveau et ne pas dépendre des validateurs HTTP.",
  },
  {
    regex: "^\\.\\.(?:/\\.\\.)*/lib(?:/|$)",
    message: "Le module db doit rester bas niveau et ne pas dépendre des utilitaires métier.",
  },
  {
    regex: "^\\.\\.(?:/\\.\\.)*/cron(?:/|$)",
    message: "Le module db doit rester bas niveau et ne pas dépendre des jobs cron.",
  },
  {
    regex: "^\\.\\.(?:/\\.\\.)*/auth(?:/|$)",
    message:
      "Le module db ne doit pas dépendre de la couche auth applicative; garde seulement les imports locaux ./auth dans db/schema.",
  },
];

const SHARED_APP_IMPORT_PATTERNS = [
  {
    regex: "^\\.\\.?/(?:.*?/)?client/src(?:/|$)",
    message: "shared doit rester agnostique et ne pas dépendre du client.",
  },
  {
    regex: "^\\.\\.?/(?:.*?/)?server/src(?:/|$)",
    message: "shared doit rester agnostique et ne pas dépendre du server.",
  },
];

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      ".claude/",
      "design/",
      "**/*.js",
      "!eslint.config.mjs",
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

  // Complexity & code smell signals for production code
  {
    files: ["client/src/**/*.{ts,tsx}", "server/src/**/*.{ts,tsx}", "shared/*.ts"],
    ignores: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/__tests__/**"],
    plugins: {
      sonarjs,
    },
    rules: {
      "sonarjs/cognitive-complexity": ["warn", 25],
      "sonarjs/no-duplicated-branches": "warn",
      "sonarjs/no-identical-conditions": "warn",
      "sonarjs/no-identical-expressions": "warn",
      "sonarjs/no-useless-catch": "warn",
    },
  },

  // Client boundaries — progressive enforcement only on the obvious edges.
  // We intentionally do not enforce lib <-> hooks yet because client/src/lib/stopped-session.ts
  // still depends on useGpsTracking; forcing it now would create noise instead of signal.
  {
    files: ["client/src/components/**/*.{ts,tsx}"],
    ignores: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: createRestrictedImportRule(CLIENT_PAGE_IMPORT_PATTERNS),
  },
  {
    files: ["client/src/hooks/**/*.{ts,tsx}"],
    ignores: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: createRestrictedImportRule([
      ...CLIENT_PAGE_IMPORT_PATTERNS,
      ...CLIENT_COMPONENT_IMPORT_PATTERNS,
    ]),
  },
  {
    files: ["client/src/lib/**/*.{ts,tsx}"],
    ignores: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: createRestrictedImportRule([
      ...CLIENT_PAGE_IMPORT_PATTERNS,
      ...CLIENT_COMPONENT_IMPORT_PATTERNS,
    ]),
  },

  // Server boundaries — keep routes at the edge and db at the bottom.
  {
    files: [
      "server/src/auth.ts",
      "server/src/auth/**/*.{ts,tsx}",
      "server/src/cron/**/*.{ts,tsx}",
      "server/src/lib/**/*.{ts,tsx}",
      "server/src/types/**/*.{ts,tsx}",
      "server/src/validators/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: createRestrictedImportRule(SERVER_ROUTE_IMPORT_PATTERNS),
  },
  {
    files: ["server/src/db/**/*.{ts,tsx}"],
    ignores: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: createRestrictedImportRule(SERVER_HIGH_LEVEL_IMPORT_PATTERNS),
  },
  {
    files: ["shared/*.ts"],
    ignores: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: createRestrictedImportRule(SHARED_APP_IMPORT_PATTERNS),
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
    files: ["*.config.{ts,js,mjs}", "client/vite.config.ts", "drizzle.config.ts"],
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
