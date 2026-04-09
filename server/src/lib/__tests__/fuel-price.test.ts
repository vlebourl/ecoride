import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock logger to suppress output
vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  getFuelPrice,
  _getCacheSize,
  _clearCache,
  _setCacheEntry,
  _MAX_CACHE_SIZE,
  _CACHE_TTL_MS,
} from "../fuel-price";

const FALLBACK_PRICES: Record<string, number> = {
  sp95: 1.75,
  sp98: 1.85,
  diesel: 1.65,
  e85: 0.85,
  gpl: 0.95,
};

beforeEach(() => {
  _clearCache();
  vi.restoreAllMocks();
});

describe("getFuelPrice", () => {
  it("returns fallback price when fetch throws (network error)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const result = await getFuelPrice("sp95");
    expect(result.priceEur).toBe(FALLBACK_PRICES.sp95);
    expect(result.fuelType).toBe("sp95");
    expect(result.stationName).toBeUndefined();
  });

  it("returns fallback price when API responds with non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));

    const result = await getFuelPrice("diesel");
    expect(result.priceEur).toBe(FALLBACK_PRICES.diesel);
    expect(result.fuelType).toBe("diesel");
  });

  it("returns fallback when API returns empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );

    const result = await getFuelPrice("e85");
    expect(result.priceEur).toBe(FALLBACK_PRICES.e85);
  });

  it("returns API price when API returns a valid result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              nom_ev: "Station Total",
              prix_valeur: 1820, // stored as milli-euros: 1820 = 1.820 EUR
              prix_maj: "2025-06-15T10:00:00Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await getFuelPrice("sp98");
    expect(result.priceEur).toBe(1.82);
    expect(result.stationName).toBe("Station Total");
    expect(result.fuelType).toBe("sp98");
  });

  it("uses geo params when lat/lng are provided", async () => {
    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      capturedUrl = decodeURIComponent(String(url));
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });

    await getFuelPrice("sp95", 48.85, 2.35);
    // URL params encode spaces as '+', so check for the parts individually
    expect(capturedUrl).toContain("2.35");
    expect(capturedUrl).toContain("48.85");
    expect(capturedUrl).toContain("within_distance");
    expect(capturedUrl).toContain("distance(geom");
  });

  it("caches results to avoid repeated fetch calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ nom_ev: "Cached", prix_valeur: 1900, prix_maj: "2025-01-01" }],
        }),
        { status: 200 },
      ),
    );

    // Two calls with same key
    await getFuelPrice("gpl");
    await getFuelPrice("gpl");
    // Second call should be served from cache — fetch only called once
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("handles missing prix_valeur by falling back to hardcoded price", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ nom_ev: "NoPrix", prix_maj: "2025-01-01" }],
        }),
        { status: 200 },
      ),
    );

    const result = await getFuelPrice("sp95", 1.0, 2.0); // different key to bypass cache
    // prix_valeur undefined => FALLBACK_PRICES[sp95] * 1000 / 1000 = 1.75
    expect(result.priceEur).toBe(FALLBACK_PRICES.sp95);
  });
});

describe("fuel-price cache eviction", () => {
  beforeEach(() => {
    _clearCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    _clearCache();
  });

  it("evicts expired entries when cache exceeds max size", async () => {
    const now = Date.now();

    // Fill the cache to MAX_CACHE_SIZE with expired entries
    for (let i = 0; i < _MAX_CACHE_SIZE; i++) {
      _setCacheEntry(`expired-${i}`, {
        priceEur: 1.5,
        fuelType: "sp95",
        updatedAt: "2025-01-01",
        cachedAt: now - _CACHE_TTL_MS - 1000, // expired
      });
    }

    expect(_getCacheSize()).toBe(_MAX_CACHE_SIZE);

    // Trigger eviction by calling getFuelPrice (which sets a new cache entry)
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    await getFuelPrice("diesel", 99.0, 99.0); // unique key to avoid hitting existing cache

    // All expired entries should have been evicted, only the new one remains
    expect(_getCacheSize()).toBe(1);
  });

  it("evicts oldest 10% when cache exceeds max size with non-expired entries", async () => {
    const now = Date.now();

    // Fill the cache with still-valid entries
    for (let i = 0; i < _MAX_CACHE_SIZE; i++) {
      _setCacheEntry(`valid-${i}`, {
        priceEur: 1.5,
        fuelType: "sp95",
        updatedAt: "2025-01-01",
        cachedAt: now - i * 10, // all still valid, varying ages
      });
    }

    expect(_getCacheSize()).toBe(_MAX_CACHE_SIZE);

    // Trigger eviction
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    await getFuelPrice("e85", 88.0, 88.0); // unique key

    // Should have evicted 10% + added the new one
    const expectedAfterEviction = _MAX_CACHE_SIZE - Math.ceil(_MAX_CACHE_SIZE * 0.1) + 1;
    expect(_getCacheSize()).toBe(expectedAfterEviction);
  });

  it("does not evict when cache is below max size", () => {
    _setCacheEntry("key1", {
      priceEur: 1.5,
      fuelType: "sp95",
      updatedAt: "2025-01-01",
      cachedAt: Date.now(),
    });

    expect(_getCacheSize()).toBe(1);
  });
});
