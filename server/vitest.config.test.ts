// @vitest-environment node
import { describe, expect, it } from "vitest";
import config from "./vitest.config";

describe("server vitest coverage thresholds", () => {
  it("keeps the widened risky scope and raises the branch floor above 65", () => {
    expect(config.test?.coverage?.include).toEqual([
      "src/lib/**",
      "src/routes/**",
      "src/validators/**",
      "src/auth/**",
    ]);
    expect(config.test?.coverage?.thresholds).toEqual({
      statements: 74,
      branches: 65.4,
      functions: 74,
      lines: 74,
    });
  });
});
