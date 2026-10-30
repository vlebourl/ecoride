import { describe, it, expect } from "vitest";
import { calculateSavings, plausibleStoredSavings } from "../calculations";

describe("calculateSavings", () => {
  it("calculates normal case (10km, 7L/100km, 1.85 EUR/L)", () => {
    const result = calculateSavings({
      distanceKm: 10,
      consumptionL100: 7,
      fuelPriceEur: 1.85,
    });
    // fuelSaved = 10 * 7 / 100 = 0.7 L
    expect(result.fuelSavedL).toBe(0.7);
    // co2 = 0.7 * 2.31 = 1.617
    expect(result.co2SavedKg).toBe(1.617);
    // money = 0.7 * 1.85 = 1.295 -> rounded to 1.30
    expect(result.moneySavedEur).toBe(1.3);
  });

  it("returns zeros for zero distance", () => {
    const result = calculateSavings({
      distanceKm: 0,
      consumptionL100: 7,
      fuelPriceEur: 1.85,
    });
    expect(result.fuelSavedL).toBe(0);
    expect(result.co2SavedKg).toBe(0);
    expect(result.moneySavedEur).toBe(0);
  });

  it("handles high consumption (15L/100km)", () => {
    const result = calculateSavings({
      distanceKm: 50,
      consumptionL100: 15,
      fuelPriceEur: 1.85,
    });
    // fuelSaved = 50 * 15 / 100 = 7.5 L
    expect(result.fuelSavedL).toBe(7.5);
    // co2 = 7.5 * 2.31 = 17.325
    expect(result.co2SavedKg).toBe(17.325);
    // money = 7.5 * 1.85 = 13.875 -> 13.88
    expect(result.moneySavedEur).toBe(13.88);
  });

  it("handles low fuel price (E85 at 0.85 EUR/L)", () => {
    const result = calculateSavings({
      distanceKm: 20,
      consumptionL100: 10,
      fuelPriceEur: 0.85,
    });
    // fuelSaved = 20 * 10 / 100 = 2 L
    expect(result.fuelSavedL).toBe(2);
    // co2 = 2 * 2.31 = 4.62
    expect(result.co2SavedKg).toBe(4.62);
    // money = 2 * 0.85 = 1.70
    expect(result.moneySavedEur).toBe(1.7);
  });

  it("rounds CO2 to 3 decimal places", () => {
    // Choose values that produce many decimals
    // distanceKm=1, consumption=3, price=1 => fuel=0.03
    // co2 = 0.03 * 2.31 = 0.0693 -> rounded to 0.069
    const result = calculateSavings({
      distanceKm: 1,
      consumptionL100: 3,
      fuelPriceEur: 1,
    });
    expect(result.co2SavedKg).toBe(0.069);
  });

  it("rounds money to 2 decimal places", () => {
    // fuel = 10 * 6 / 100 = 0.6
    // money = 0.6 * 1.333 = 0.7998 -> rounded to 0.80
    const result = calculateSavings({
      distanceKm: 10,
      consumptionL100: 6,
      fuelPriceEur: 1.333,
    });
    expect(result.moneySavedEur).toBe(0.8);
  });

  it("rounds fuelSavedL to 3 decimal places", () => {
    // fuel = 7 * 3 / 100 = 0.21
    const result = calculateSavings({
      distanceKm: 7,
      consumptionL100: 3,
      fuelPriceEur: 1,
    });
    expect(result.fuelSavedL).toBe(0.21);
  });

  it("handles very small distance", () => {
    const result = calculateSavings({
      distanceKm: 0.1,
      consumptionL100: 7,
      fuelPriceEur: 1.85,
    });
    // fuelSaved = 0.1 * 7 / 100 = 0.007
    expect(result.fuelSavedL).toBe(0.007);
    // co2 = 0.007 * 2.31 = 0.01617 -> 0.016
    expect(result.co2SavedKg).toBe(0.016);
    // money = 0.007 * 1.85 = 0.01295 -> 0.01
    expect(result.moneySavedEur).toBe(0.01);
  });
});

describe("plausibleStoredSavings", () => {
  it("accepts what calculateSavings produced, rounded or stored as float32", () => {
    for (const distanceKm of [0.01, 0.37, 3.333, 12.345, 87.654, 500]) {
      for (const consumptionL100 of [0.1, 3.9, 5.67, 7, 12.5, 50]) {
        for (const fuelPriceEur of [0.85, 1.234, 1.75, 2.049, 5]) {
          const saved = calculateSavings({ distanceKm, consumptionL100, fuelPriceEur });
          for (const stored of [saved, mapValues(saved, Math.fround)]) {
            expect(plausibleStoredSavings({ distanceKm, ...stored, fuelPriceEur })).toEqual({
              ...stored,
              fuelPriceEur,
            });
          }
        }
      }
    }
  });

  it("returns null for missing savings and keeps an absent price as null", () => {
    expect(
      plausibleStoredSavings({ distanceKm: 10, fuelSavedL: 0.7, co2SavedKg: 1.617 }),
    ).toBeNull();
    expect(
      plausibleStoredSavings({
        distanceKm: 10,
        fuelSavedL: 0.7,
        co2SavedKg: 1.617,
        moneySavedEur: 1.3,
      }),
    ).toMatchObject({ fuelPriceEur: null });
  });

  it.each([
    {
      label: "fuel above distance x 50 L/100km",
      fuelSavedL: 5.01,
      co2SavedKg: 11.573,
      moneySavedEur: 5,
    },
    { label: "CO2 off the ADEME factor", fuelSavedL: 0.7, co2SavedKg: 10_000, moneySavedEur: 1.3 },
    { label: "money above fuel x 5 EUR/L", fuelSavedL: 0.7, co2SavedKg: 1.617, moneySavedEur: 3.6 },
    {
      label: "fuel price above 5 EUR/L",
      fuelSavedL: 0.7,
      co2SavedKg: 1.617,
      moneySavedEur: 1.3,
      fuelPriceEur: 5.01,
    },
  ])("returns null for $label", ({ label: _label, ...savings }) => {
    expect(plausibleStoredSavings({ distanceKm: 10, ...savings })).toBeNull();
  });
});

function mapValues(saved: ReturnType<typeof calculateSavings>, fn: (n: number) => number) {
  return {
    co2SavedKg: fn(saved.co2SavedKg),
    moneySavedEur: fn(saved.moneySavedEur),
    fuelSavedL: fn(saved.fuelSavedL),
  };
}
