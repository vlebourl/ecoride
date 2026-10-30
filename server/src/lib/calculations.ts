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

// Upper bounds already enforced elsewhere: the profile validator caps
// consumption at 50 L/100km and the import route only trusts market prices <= 5 EUR/L.
export const MAX_CONSUMPTION_L100 = 50;
export const MAX_FUEL_PRICE_EUR = 5;

// calculateSavings rounds fuel to 3 decimals, CO2 to 3 and money to 2, so a genuine
// stored trip can drift from the exact formulas by up to these amounts.
const FUEL_ROUNDING_L = 0.001;
const CO2_ROUNDING_KG = 0.002;
const MONEY_ROUNDING_EUR = 0.01;

export interface StoredSavings {
  distanceKm: number;
  co2SavedKg?: number;
  moneySavedEur?: number;
  fuelSavedL?: number;
  fuelPriceEur?: number | null;
}

/**
 * Return the savings stored in an export when they are physically possible for the trip,
 * or null when they are missing or impossible (the caller then recalculates them).
 * Plausible = fuel within distance x max consumption, CO2 matching fuel x ADEME factor,
 * money within fuel x max price, and a stored fuel price not above that maximum.
 */
export function plausibleStoredSavings(
  trip: StoredSavings,
): (SavingsResult & { fuelPriceEur: number | null }) | null {
  const { co2SavedKg, moneySavedEur, fuelSavedL } = trip;
  if (co2SavedKg === undefined || moneySavedEur === undefined || fuelSavedL === undefined)
    return null;
  const fuelPriceEur = trip.fuelPriceEur ?? null;

  const plausible =
    fuelSavedL <= (trip.distanceKm * MAX_CONSUMPTION_L100) / 100 + FUEL_ROUNDING_L &&
    Math.abs(co2SavedKg - fuelSavedL * CO2_KG_PER_LITER) <= CO2_ROUNDING_KG &&
    moneySavedEur <= fuelSavedL * MAX_FUEL_PRICE_EUR + MONEY_ROUNDING_EUR &&
    (fuelPriceEur === null || fuelPriceEur <= MAX_FUEL_PRICE_EUR);

  return plausible ? { co2SavedKg, moneySavedEur, fuelSavedL, fuelPriceEur } : null;
}
