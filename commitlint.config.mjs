export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow longer subject lines (default 72 is too short for descriptive messages)
    "header-max-length": [1, "always", 120],
    // Allow these types
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "chore", "refactor", "perf", "test", "ci", "build", "style"],
    ],
  },
};
