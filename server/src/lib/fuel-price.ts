import type { FuelType } from "@ecoride/shared/types";

interface CachedPrice {
  priceEur: number;
  fuelType: FuelType;
  stationName?: string;
  updatedAt: string;
  cachedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, CachedPrice>();

// National average fallback prices (€/L, updated periodically)
const FALLBACK_PRICES: Record<FuelType, number> = {
  sp95: 1.75,
  sp98: 1.85,
  diesel: 1.65,
  e85: 0.85,
  gpl: 0.95,
};

// Map our fuel types to the API's fuel type codes
const FUEL_TYPE_API_CODES: Record<FuelType, string> = {
  sp95: "E10",
  sp98: "SP98",
  diesel: "Gazole",
  e85: "E85",
  gpl: "GPLc",
};

/**
 * Fetch fuel price from the French open data API.
 * Uses geolocation to find nearby stations. Falls back to national average.
 */
export async function getFuelPrice(
  fuelType: FuelType,
  lat?: number,
  lng?: number,
): Promise<CachedPrice> {
  const cacheKey = `${fuelType}-${lat?.toFixed(2)}-${lng?.toFixed(2)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const apiCode = FUEL_TYPE_API_CODES[fuelType];
    const params = new URLSearchParams({
      select: "nom_ev,prix_valeur,prix_maj",
      where: `carburants_disponibles LIKE '%${apiCode}%' AND prix_nom='${apiCode}'`,
      order_by: "prix_maj DESC",
      limit: "1",
    });

    if (lat !== undefined && lng !== undefined) {
      params.set("where", `${params.get("where")} AND within_distance(geom, GEOM'POINT(${lng} ${lat})', 20km)`);
      params.set("order_by", `distance(geom, GEOM'POINT(${lng} ${lat})')`);
    }

    const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      throw new Error(`API responded ${response.status}`);
    }

    const data = await response.json() as {
      results: Array<{
        nom_ev?: string;
        prix_valeur?: number;
        prix_maj?: string;
      }>;
    };

    if (data.results.length > 0) {
      const record = data.results[0]!;
      const result: CachedPrice = {
        priceEur: (record.prix_valeur ?? FALLBACK_PRICES[fuelType] * 1000) / 1000,
        fuelType,
        stationName: record.nom_ev,
        updatedAt: record.prix_maj ?? new Date().toISOString(),
        cachedAt: Date.now(),
      };
      cache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn("[fuel-price] API fetch failed, using fallback:", err instanceof Error ? err.message : err);
  }

  // Fallback to national average
  const fallback: CachedPrice = {
    priceEur: FALLBACK_PRICES[fuelType],
    fuelType,
    updatedAt: new Date().toISOString(),
    cachedAt: Date.now(),
  };
  cache.set(cacheKey, fallback);
  return fallback;
}
