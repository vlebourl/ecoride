const CO2_PER_LITER = 2.31 // kg CO2 per liter (ADEME)

function clamp(value: number): number {
  return value > 0 ? value : 0
}

export function fuelSaved(distanceKm: number, consumptionL100: number): number {
  return (clamp(distanceKm) * clamp(consumptionL100)) / 100
}

export function co2Saved(distanceKm: number, consumptionL100: number): number {
  return fuelSaved(distanceKm, consumptionL100) * CO2_PER_LITER
}

export function moneySaved(
  distanceKm: number,
  consumptionL100: number,
  fuelPriceEur: number,
): number {
  return fuelSaved(distanceKm, consumptionL100) * clamp(fuelPriceEur)
}

export interface SavingsResult {
  co2SavedKg: number
  moneySavedEur: number
  fuelSavedL: number
}

export function computeSavings(
  distanceKm: number,
  consumptionL100: number,
  fuelPriceEur: number,
): SavingsResult {
  const fuel = fuelSaved(distanceKm, consumptionL100)
  return {
    co2SavedKg: fuel * CO2_PER_LITER,
    moneySavedEur: fuel * clamp(fuelPriceEur),
    fuelSavedL: fuel,
  }
}
