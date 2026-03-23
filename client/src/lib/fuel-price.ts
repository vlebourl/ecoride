type FuelType = "sp95" | "sp98" | "diesel" | "e85" | "gpl";

const BASE_URL =
  "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";

const FUEL_PRICE_FIELDS: Record<FuelType, string> = {
  sp95: "sp95_prix",
  sp98: "sp98_prix",
  diesel: "gazole_prix",
  e85: "e85_prix",
  gpl: "gplc_prix",
};

const CACHE_TTL_MS = 30 * 60 * 1000;

export interface FuelPriceResult {
  priceEur: number;
  source: "geolocated" | "national_average";
  stationName?: string;
}

interface CacheEntry {
  result: FuelPriceResult;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(fuelType: FuelType, lat?: number, lng?: number): string {
  if (lat !== undefined && lng !== undefined) {
    return `${fuelType}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  }
  return `${fuelType}:national`;
}

function getCached(key: string): FuelPriceResult | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.result;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, result: FuelPriceResult): void {
  cache.set(key, { result, timestamp: Date.now() });
}

async function fetchNearestStation(
  fuelType: FuelType,
  lat: number,
  lng: number,
): Promise<FuelPriceResult | null> {
  const priceField = FUEL_PRICE_FIELDS[fuelType];
  const params = new URLSearchParams({
    where: `within_distance(geom,geom'POINT(${lng} ${lat})',10km) AND ${priceField} is not null`,
    select: `adresse,ville,${priceField}`,
    order_by: `distance(geom,geom'POINT(${lng} ${lat})')`,
    limit: "1",
  });

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  const record = data.results?.[0];
  if (!record) return null;

  const price = Number(record[priceField]);
  if (!price || price <= 0) return null;

  return {
    priceEur: price,
    source: "geolocated",
    stationName: `${record.adresse ?? ""}, ${record.ville ?? ""}`.trim(),
  };
}

async function fetchNationalAverage(fuelType: FuelType): Promise<number | null> {
  const priceField = FUEL_PRICE_FIELDS[fuelType];
  const params = new URLSearchParams({
    select: `avg(${priceField}) as avg_price`,
    where: `${priceField} is not null`,
  });

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  const avg = data.results?.[0]?.avg_price;
  return typeof avg === "number" && avg > 0 ? avg : null;
}

export async function fetchFuelPrice(
  fuelType: FuelType,
  coords?: { lat: number; lng: number },
): Promise<FuelPriceResult> {
  const key = cacheKey(fuelType, coords?.lat, coords?.lng);
  const cached = getCached(key);
  if (cached) return cached;

  if (coords) {
    try {
      const result = await fetchNearestStation(fuelType, coords.lat, coords.lng);
      if (result) {
        setCache(key, result);
        return result;
      }
    } catch {
      // Fall through to national average
    }
  }

  try {
    const avg = await fetchNationalAverage(fuelType);
    if (avg) {
      const result: FuelPriceResult = { priceEur: avg, source: "national_average" };
      setCache(key, result);
      return result;
    }
  } catch {
    // Fall through to hardcoded fallback
  }

  return { priceEur: 1.85, source: "national_average" };
}

export function clearFuelPriceCache(): void {
  cache.clear();
}
