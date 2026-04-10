/**
 * Offline map tile cache (feature #242).
 *
 * The service worker runtime cache name must stay in sync with the one
 * declared in vite.config.ts (VitePWA.workbox.runtimeCaching[0].cacheName).
 * Renaming it means users lose their downloaded tiles, so treat this string
 * as part of the public storage contract.
 */
export const MAP_TILE_CACHE_NAME = "ecoride-map-tiles-v1";

export interface TileCacheInfo {
  /** Number of cached tile / style / sprite / glyph entries. */
  entries: number;
  /** Rough on-disk footprint in bytes, or null if navigator.storage.estimate is unavailable. */
  approxBytes: number | null;
}

/**
 * Inspect the map tile Cache Storage bucket. Returns zeros if the cache
 * doesn't exist yet (e.g., user never opened a map). Never throws.
 */
export async function getTileCacheInfo(): Promise<TileCacheInfo> {
  let entries = 0;
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      if (names.includes(MAP_TILE_CACHE_NAME)) {
        const cache = await caches.open(MAP_TILE_CACHE_NAME);
        const keys = await cache.keys();
        entries = keys.length;
      }
    }
  } catch {
    // Swallow — the row just shows 0 entries.
  }

  let approxBytes: number | null = null;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      // The estimate covers the whole origin, not just the tile cache. It is
      // still the most useful signal we can surface — we label it "approx".
      approxBytes = estimate.usage ?? null;
    }
  } catch {
    // Ignore — approxBytes stays null.
  }

  return { entries, approxBytes };
}

/**
 * Delete the map tile cache. Safe to call even if the cache does not exist.
 * Returns true if a cache was deleted.
 */
export async function clearTileCache(): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    return await caches.delete(MAP_TILE_CACHE_NAME);
  } catch {
    return false;
  }
}

/** Format a byte count as a short human-readable string (KB/MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
