import type { FuelType } from "@ecoride/shared/types";
import { detectEuCountry, isInFrance, lookupEuPrice } from "./fuel-price-eu";
import { logger } from "./logger";

interface CachedPrice {
  priceEur: number;
  fuelType: FuelType;
  stationName?: string;
  updatedAt: string;
  cachedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 500;
const cache = new Map<string, CachedPrice>();

/**
 * Evict entries when the cache exceeds MAX_CACHE_SIZE.
 * 1. Delete expired entries (cachedAt + CACHE_TTL_MS <= now)
 * 2. If still over, delete oldest 10% by cachedAt
 */
function evictIfNeeded(): void {
  if (cache.size < MAX_CACHE_SIZE) return;

  const now = Date.now();
  // Pass 1: delete expired entries
  for (const [key, entry] of cache) {
    if (entry.cachedAt + CACHE_TTL_MS <= now) {
      cache.delete(key);
    }
  }

  // Pass 2: if still over, delete oldest 10% by cachedAt
  if (cache.size >= MAX_CACHE_SIZE) {
    const entries = [...cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toDelete = Math.ceil(cache.size * 0.1);
    for (let i = 0; i < toDelete; i++) {
      cache.delete(entries[i]![0]);
    }
  }
}

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

  // Outside France: skip the French station API entirely and use the EU
  // Weekly Oil Bulletin snapshot for the detected country (issue #94).
  // Check specific EU country bboxes before the France bbox, because the
  // France bbox overlaps small neighbours like Belgium and Luxembourg.
  if (lat !== undefined && lng !== undefined) {
    const country = detectEuCountry(lat, lng);
    const useEuPath = country !== undefined || !isInFrance(lat, lng);
    if (useEuPath) {
      const euPrice = country ? lookupEuPrice(country, fuelType) : undefined;
      if (country && euPrice !== undefined) {
        const result: CachedPrice = {
          priceEur: euPrice,
          fuelType,
          stationName: `EU Oil Bulletin (${country})`,
          updatedAt: new Date().toISOString(),
          cachedAt: Date.now(),
        };
        evictIfNeeded();
        cache.set(cacheKey, result);
        return result;
      }
      // Unknown country or fuel type not in EU bulletin → fall back to the
      // hardcoded national average (still skipping the French station API).
      const fallback: CachedPrice = {
        priceEur: FALLBACK_PRICES[fuelType],
        fuelType,
        updatedAt: new Date().toISOString(),
        cachedAt: Date.now(),
      };
      evictIfNeeded();
      cache.set(cacheKey, fallback);
      return fallback;
    }
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
      params.set(
        "where",
        `${params.get("where")} AND within_distance(geom, GEOM'POINT(${lng} ${lat})', 20km)`,
      );
      params.set("order_by", `distance(geom, GEOM'POINT(${lng} ${lat})')`);
    }

    const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });

    if (!response.ok) {
      throw new Error(`API responded ${response.status}`);
    }

    const data = (await response.json()) as {
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
      evictIfNeeded();
      cache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    logger.warn("fuel_price_api_failed", {
      fuelType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback to national average
  const fallback: CachedPrice = {
    priceEur: FALLBACK_PRICES[fuelType],
    fuelType,
    updatedAt: new Date().toISOString(),
    cachedAt: Date.now(),
  };
  evictIfNeeded();
  cache.set(cacheKey, fallback);
  return fallback;
}

/** @internal Exposed for testing only */
export function _getCacheSize(): number {
  return cache.size;
}

/** @internal Exposed for testing only — clear all entries */
export function _clearCache(): void {
  cache.clear();
}

/** @internal Exposed for testing only — directly insert a cache entry */
export function _setCacheEntry(key: string, entry: CachedPrice): void {
  cache.set(key, entry);
}

/** @internal Exposed for testing only */
export const _MAX_CACHE_SIZE = MAX_CACHE_SIZE;

/** @internal Exposed for testing only */
export const _CACHE_TTL_MS = CACHE_TTL_MS;
