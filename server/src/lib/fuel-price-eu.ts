import type { FuelType } from "@ecoride/shared/types";

/**
 * Static snapshot of fuel prices from the EU Weekly Oil Bulletin, used when
 * a trip starts outside France. Values are consumer prices incl. tax (€/L).
 *
 * Source: https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en
 * Snapshot: 2025-11 (refresh manually when stale — no stable JSON endpoint).
 *
 * Only countries with a real cross-border use case from France are listed;
 * unknown countries fall back to the hardcoded French national average in
 * fuel-price.ts. The Oil Bulletin does not publish E85/GPL for most members,
 * so those fall back to the French average too.
 */
export const EU_COUNTRY_PRICES: Record<string, Partial<Record<FuelType, number>>> = {
  BE: { sp95: 1.72, sp98: 1.78, diesel: 1.78 },
  LU: { sp95: 1.5, sp98: 1.56, diesel: 1.4 },
  DE: { sp95: 1.75, sp98: 1.83, diesel: 1.65 },
  NL: { sp95: 2.05, sp98: 2.15, diesel: 1.72 },
  CH: { sp95: 1.8, sp98: 1.87, diesel: 1.85 },
  IT: { sp95: 1.8, sp98: 1.9, diesel: 1.7 },
  ES: { sp95: 1.5, sp98: 1.65, diesel: 1.43 },
  PT: { sp95: 1.73, sp98: 1.83, diesel: 1.6 },
  AT: { sp95: 1.48, sp98: 1.6, diesel: 1.5 },
  PL: { sp95: 1.4, sp98: 1.5, diesel: 1.45 },
  IE: { sp95: 1.78, sp98: 1.85, diesel: 1.72 },
  DK: { sp95: 1.9, sp98: 1.98, diesel: 1.75 },
  CZ: { sp95: 1.52, sp98: 1.65, diesel: 1.48 },
  SK: { sp95: 1.55, sp98: 1.65, diesel: 1.55 },
  SI: { sp95: 1.55, sp98: 1.65, diesel: 1.55 },
  HR: { sp95: 1.5, sp98: 1.62, diesel: 1.48 },
  HU: { sp95: 1.5, sp98: 1.62, diesel: 1.5 },
  GR: { sp95: 1.85, sp98: 1.98, diesel: 1.6 },
  SE: { sp95: 1.65, sp98: 1.75, diesel: 1.75 },
  FI: { sp95: 1.85, sp98: 1.95, diesel: 1.7 },
};

interface CountryBox {
  code: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

/**
 * Approximate country bounding boxes used to resolve a GPS point to a
 * country code. Ordered from smallest/most-enclosed to largest so that
 * border-region points resolve to the most specific country first.
 *
 * This is intentionally low-precision — fuel pricing is country-level,
 * so a few kilometres of error on the border is acceptable.
 */
const COUNTRY_BOXES: readonly CountryBox[] = [
  { code: "LU", latMin: 49.4, latMax: 50.2, lngMin: 5.7, lngMax: 6.55 },
  { code: "BE", latMin: 49.5, latMax: 51.55, lngMin: 2.5, lngMax: 6.4 },
  { code: "NL", latMin: 50.7, latMax: 53.6, lngMin: 3.3, lngMax: 7.25 },
  { code: "CH", latMin: 45.8, latMax: 47.85, lngMin: 5.9, lngMax: 10.5 },
  { code: "AT", latMin: 46.3, latMax: 49.05, lngMin: 9.5, lngMax: 17.2 },
  { code: "SI", latMin: 45.4, latMax: 46.9, lngMin: 13.4, lngMax: 16.6 },
  { code: "HR", latMin: 42.4, latMax: 46.55, lngMin: 13.5, lngMax: 19.45 },
  { code: "CZ", latMin: 48.55, latMax: 51.1, lngMin: 12.1, lngMax: 18.9 },
  { code: "SK", latMin: 47.7, latMax: 49.6, lngMin: 16.8, lngMax: 22.6 },
  { code: "HU", latMin: 45.7, latMax: 48.6, lngMin: 16.1, lngMax: 22.9 },
  { code: "DK", latMin: 54.5, latMax: 57.8, lngMin: 8.0, lngMax: 12.7 },
  { code: "IE", latMin: 51.4, latMax: 55.5, lngMin: -10.8, lngMax: -5.9 },
  { code: "PT", latMin: 36.9, latMax: 42.2, lngMin: -9.55, lngMax: -6.2 },
  { code: "GR", latMin: 34.8, latMax: 41.8, lngMin: 19.3, lngMax: 29.7 },
  { code: "DE", latMin: 47.2, latMax: 55.1, lngMin: 5.8, lngMax: 15.1 },
  { code: "IT", latMin: 35.5, latMax: 47.1, lngMin: 6.6, lngMax: 18.6 },
  { code: "ES", latMin: 35.9, latMax: 43.85, lngMin: -9.4, lngMax: 4.35 },
  { code: "PL", latMin: 49.0, latMax: 54.9, lngMin: 14.1, lngMax: 24.2 },
  { code: "SE", latMin: 55.3, latMax: 69.1, lngMin: 10.9, lngMax: 24.2 },
  { code: "FI", latMin: 59.8, latMax: 70.1, lngMin: 20.5, lngMax: 31.6 },
];

// Metropolitan France bounding box (covers mainland + Corsica).
const FRANCE_BOX = { latMin: 41.3, latMax: 51.1, lngMin: -5.2, lngMax: 9.6 };

export function isInFrance(lat: number, lng: number): boolean {
  return (
    lat >= FRANCE_BOX.latMin &&
    lat <= FRANCE_BOX.latMax &&
    lng >= FRANCE_BOX.lngMin &&
    lng <= FRANCE_BOX.lngMax
  );
}

/**
 * Resolve a GPS point to an ISO-3166 alpha-2 country code using the static
 * bbox table. Returns undefined if the point is not in any known country.
 * France is intentionally excluded here — callers should check isInFrance()
 * first to route French coordinates through the station-level API.
 */
export function detectEuCountry(lat: number, lng: number): string | undefined {
  for (const box of COUNTRY_BOXES) {
    if (lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax) {
      return box.code;
    }
  }
  return undefined;
}

export function lookupEuPrice(country: string, fuelType: FuelType): number | undefined {
  return EU_COUNTRY_PRICES[country]?.[fuelType];
}
