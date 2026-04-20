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

const DEFAULT_FRANCE_LOOKUP = {
  lat: 46.1944,
  lng: 6.2376,
};

const FUEL_TYPE_API_FIELDS: Record<FuelType, { price: string; updatedAt: string }> = {
  sp95: { price: "e10_prix", updatedAt: "e10_maj" },
  sp98: { price: "sp98_prix", updatedAt: "sp98_maj" },
  diesel: { price: "gazole_prix", updatedAt: "gazole_maj" },
  e85: { price: "e85_prix", updatedAt: "e85_maj" },
  gpl: { price: "gplc_prix", updatedAt: "gplc_maj" },
};

function formatStationName(address?: string, city?: string): string | undefined {
  const parts = [address?.trim(), city?.trim()].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * Fetch fuel price from the French open data API.
 * Uses caller coordinates when available, otherwise defaults to Annemasse so
 * profile lookups stay local to ecoRide's operating area.
 */
export async function getFuelPrice(
  fuelType: FuelType,
  lat?: number,
  lng?: number,
): Promise<CachedPrice> {
  const hasExplicitCoords = lat !== undefined && lng !== undefined;
  const lookupLat = hasExplicitCoords ? lat : DEFAULT_FRANCE_LOOKUP.lat;
  const lookupLng = hasExplicitCoords ? lng : DEFAULT_FRANCE_LOOKUP.lng;
  const cacheKey = `${fuelType}-${lookupLat.toFixed(2)}-${lookupLng.toFixed(2)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  // Outside France: skip the French station API entirely and use the EU
  // Weekly Oil Bulletin snapshot for the detected country (issue #94).
  // Coord-less requests intentionally stay on the French path because the
  // profile card defaults to a local Annemasse station lookup.
  if (hasExplicitCoords) {
    // Check specific EU country bboxes before the France bbox, because the
    // France bbox overlaps small neighbours like Belgium and Luxembourg.
    const country = detectEuCountry(lookupLat, lookupLng);
    const useEuPath = country !== undefined || !isInFrance(lookupLat, lookupLng);
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
    const apiFields = FUEL_TYPE_API_FIELDS[fuelType];
    const params = new URLSearchParams({
      select: `adresse,ville,${apiFields.price},${apiFields.updatedAt}`,
      where: `${apiFields.price} is not null AND within_distance(geom, geom'POINT(${lookupLng} ${lookupLat})', 20km)`,
      order_by: `distance(geom, geom'POINT(${lookupLng} ${lookupLat})')`,
      limit: "1",
    });

    const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });

    if (!response.ok) {
      throw new Error(`API responded ${response.status}`);
    }

    const data = (await response.json()) as {
      results: Array<Record<string, unknown> & { adresse?: string; ville?: string }>;
    };

    if (data.results.length > 0) {
      const record = data.results[0]!;
      const rawPrice = record[apiFields.price];
      const rawUpdatedAt = record[apiFields.updatedAt];
      const priceEur = typeof rawPrice === "number" ? rawPrice : FALLBACK_PRICES[fuelType];
      const result: CachedPrice = {
        priceEur,
        fuelType,
        stationName: formatStationName(record.adresse, record.ville),
        updatedAt: typeof rawUpdatedAt === "string" ? rawUpdatedAt : new Date().toISOString(),
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
