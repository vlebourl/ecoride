import { describe, it, expect } from "vitest";
import { calculateSavings } from "../calculations";

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
