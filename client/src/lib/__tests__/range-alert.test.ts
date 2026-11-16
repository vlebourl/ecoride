import { describe, expect, it } from "vitest";
import { isRangeShort } from "@/lib/battery-usage";

describe("isRangeShort (#422)", () => {
  it("stays quiet without a range or a route", () => {
    expect(isRangeShort(null, 5000)).toBe(false);
    expect(isRangeShort(10, null)).toBe(false);
  });

  it("warns when the range does not cover the rest of the route", () => {
    expect(isRangeShort(4, 5000)).toBe(true);
  });

  it("keeps at least a 1 km margin on short routes", () => {
    // 5.5 km for 5 km to go: covered, but inside the 1 km margin.
    expect(isRangeShort(5.5, 5000)).toBe(true);
    expect(isRangeShort(6.5, 5000)).toBe(false);
  });

  it("keeps a 10 % margin on long routes", () => {
    // 30 km to go → 3 km margin.
    expect(isRangeShort(32, 30_000)).toBe(true);
    expect(isRangeShort(34, 30_000)).toBe(false);
  });
});
