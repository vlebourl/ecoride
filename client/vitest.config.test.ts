// @vitest-environment node
import { describe, expect, it } from "vitest";
import config from "./vitest.config";

describe("client vitest coverage thresholds", () => {
  it("keeps widened risky scope but leaves credible headroom above the floor", () => {
    expect(config.test?.coverage?.include).toEqual(["src/lib/**", "src/hooks/**", "src/pages/**"]);
    expect(config.test?.coverage?.thresholds).toEqual({
      statements: 62,
      branches: 55,
      functions: 49,
      lines: 63,
    });
  });
});
