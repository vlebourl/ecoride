import { CO2_KG_PER_LITER } from "@ecoride/shared/types";

export interface SavingsInput {
  distanceKm: number;
  consumptionL100: number;
  fuelPriceEur: number;
}

export interface SavingsResult {
  co2SavedKg: number;
  moneySavedEur: number;
  fuelSavedL: number;
}

/**
 * Calculate CO2, money, and fuel savings for a trip.
 * Formulas from CDC:
 * - fuel_saved_l = distance × consumption / 100
 * - co2_saved_kg = fuel_saved_l × 2.31 (ADEME factor)
 * - money_saved_eur = fuel_saved_l × fuel_price
 */
export function calculateSavings(input: SavingsInput): SavingsResult {
  const fuelSavedL = (input.distanceKm * input.consumptionL100) / 100;
  const co2SavedKg = fuelSavedL * CO2_KG_PER_LITER;
  const moneySavedEur = fuelSavedL * input.fuelPriceEur;

  return {
    co2SavedKg: Math.round(co2SavedKg * 1000) / 1000,
    moneySavedEur: Math.round(moneySavedEur * 100) / 100,
    fuelSavedL: Math.round(fuelSavedL * 1000) / 1000,
  };
}
