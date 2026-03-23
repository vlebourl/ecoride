import { describe, expect, it } from "vitest";
import { co2Saved, computeSavings, fuelSaved, moneySaved } from "../calculations";

describe("fuelSaved", () => {
  it("calculates fuel saved for standard trip", () => {
    expect(fuelSaved(10, 6.5)).toBeCloseTo(0.65);
  });
  it("returns 0 for 0 distance", () => {
    expect(fuelSaved(0, 6.5)).toBe(0);
  });
  it("returns 0 for 0 consumption", () => {
    expect(fuelSaved(10, 0)).toBe(0);
  });
  it("clamps negative distance to 0", () => {
    expect(fuelSaved(-5, 6.5)).toBe(0);
  });
  it("clamps negative consumption to 0", () => {
    expect(fuelSaved(10, -3)).toBe(0);
  });
  it("handles large values", () => {
    expect(fuelSaved(10000, 15)).toBeCloseTo(1500);
  });
  it("handles fractional values", () => {
    expect(fuelSaved(3.7, 5.2)).toBeCloseTo(0.1924);
  });
});

describe("co2Saved", () => {
  it("calculates CO2 using ADEME factor 2.31", () => {
    expect(co2Saved(10, 6.5)).toBeCloseTo(1.5015);
  });
  it("returns 0 for 0 distance", () => {
    expect(co2Saved(0, 6.5)).toBe(0);
  });
  it("returns 0 for negative values", () => {
    expect(co2Saved(-10, 6.5)).toBe(0);
    expect(co2Saved(10, -6.5)).toBe(0);
  });
  it("is consistent with fuelSaved * 2.31", () => {
    const fuel = fuelSaved(25, 7.8);
    expect(co2Saved(25, 7.8)).toBeCloseTo(fuel * 2.31);
  });
});

describe("moneySaved", () => {
  it("calculates money saved for standard trip", () => {
    expect(moneySaved(10, 6.5, 1.99)).toBeCloseTo(1.2935);
  });
  it("returns 0 for 0 fuel price", () => {
    expect(moneySaved(10, 6.5, 0)).toBe(0);
  });
  it("clamps negative fuel price to 0", () => {
    expect(moneySaved(10, 6.5, -1.5)).toBe(0);
  });
  it("returns 0 for 0 distance", () => {
    expect(moneySaved(0, 6.5, 1.99)).toBe(0);
  });
});

describe("computeSavings", () => {
  it("returns all three savings values", () => {
    const r = computeSavings(10, 6.5, 1.99);
    expect(r.fuelSavedL).toBeCloseTo(0.65);
    expect(r.co2SavedKg).toBeCloseTo(1.5015);
    expect(r.moneySavedEur).toBeCloseTo(1.2935);
  });
  it("maintains consistency: co2 = fuel * 2.31", () => {
    const r = computeSavings(42, 8.3, 1.85);
    expect(r.co2SavedKg).toBeCloseTo(r.fuelSavedL * 2.31);
  });
  it("handles all zeros", () => {
    const r = computeSavings(0, 0, 0);
    expect(r.fuelSavedL).toBe(0);
    expect(r.co2SavedKg).toBe(0);
    expect(r.moneySavedEur).toBe(0);
  });
  it("handles negative inputs by clamping", () => {
    const r = computeSavings(-5, -3, -1);
    expect(r.fuelSavedL).toBe(0);
    expect(r.co2SavedKg).toBe(0);
    expect(r.moneySavedEur).toBe(0);
  });
});
