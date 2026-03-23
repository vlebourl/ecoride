import { describe, expect, it } from "vitest";
import { computeAvgSpeedKmh } from "../calculations";

describe("computeAvgSpeedKmh", () => {
  it("calculates speed as distance / duration in km/h", () => {
    // 20 km in 3600 sec (1 hour) = 20 km/h
    expect(computeAvgSpeedKmh(20, 3600)).toBe(20);
  });

  it("rounds to 1 decimal place", () => {
    // 10 km in 3600 sec = 10.0 km/h
    expect(computeAvgSpeedKmh(10, 3600)).toBe(10);
    // 10 km in 2400 sec (40 min) = 15.0 km/h
    expect(computeAvgSpeedKmh(10, 2400)).toBe(15);
    // 7 km in 1800 sec (30 min) = 14.0 km/h
    expect(computeAvgSpeedKmh(7, 1800)).toBe(14);
    // 5 km in 720 sec (12 min) = 25.0 km/h
    expect(computeAvgSpeedKmh(5, 720)).toBe(25);
    // 12.5 km in 2700 sec (45 min) = 16.666... -> 16.7 km/h
    expect(computeAvgSpeedKmh(12.5, 2700)).toBe(16.7);
  });

  it("returns 0 for 0 duration", () => {
    expect(computeAvgSpeedKmh(10, 0)).toBe(0);
  });

  it("returns 0 for negative duration", () => {
    expect(computeAvgSpeedKmh(10, -100)).toBe(0);
  });

  it("returns 0 for 0 distance with valid duration", () => {
    expect(computeAvgSpeedKmh(0, 3600)).toBe(0);
  });

  it("handles typical cycling speeds", () => {
    // Casual: 8 km in 30 min = 16 km/h
    expect(computeAvgSpeedKmh(8, 1800)).toBeCloseTo(16);
    // Fast commuter: 15 km in 35 min (2100s) = ~25.7 km/h
    expect(computeAvgSpeedKmh(15, 2100)).toBe(25.7);
    // Sprint: 2 km in 180 sec (3 min) = 40 km/h
    expect(computeAvgSpeedKmh(2, 180)).toBe(40);
  });

  it("handles aggregated multi-trip values", () => {
    // Total: 45 km over 9000 sec (2.5 hours) = 18.0 km/h
    expect(computeAvgSpeedKmh(45, 9000)).toBe(18);
    // Total: 100 km over 18000 sec (5 hours) = 20.0 km/h
    expect(computeAvgSpeedKmh(100, 18000)).toBe(20);
  });
});
