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

  it("defaults coord-less lookups to Annemasse and returns the nearest station", async () => {
    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      capturedUrl = decodeURIComponent(String(url));
      return new Response(
        JSON.stringify({
          results: [
            {
              adresse: "6 Route des Vallées",
              ville: "Annemasse",
              e10_prix: 2.024,
              e10_maj: "2026-04-18T06:41:00Z",
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await getFuelPrice("sp95");

    expect(capturedUrl).toContain("6.2376");
    expect(capturedUrl).toContain("46.1944");
    expect(capturedUrl).toContain("within_distance");
    expect(result.priceEur).toBe(2.024);
    expect(result.stationName).toBe("6 Route des Vallées, Annemasse");
    expect(result.fuelType).toBe("sp95");
  });

  it("uses requested French coords and fuel-specific fields when lat/lng are provided", async () => {
    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      capturedUrl = decodeURIComponent(String(url));
      return new Response(
        JSON.stringify({
          results: [
            {
              adresse: "Rue de Lyon",
              ville: "Lyon",
              sp98_prix: 1.91,
              sp98_maj: "2026-04-19T10:00:00Z",
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await getFuelPrice("sp98", 45.75, 4.85);

    expect(capturedUrl).toContain("4.85");
    expect(capturedUrl).toContain("45.75");
    expect(capturedUrl).toContain("within_distance");
    expect(capturedUrl).toContain("sp98_prix");
    expect(result.priceEur).toBe(1.91);
    expect(result.stationName).toBe("Rue de Lyon, Lyon");
  });

  it("caches results to avoid repeated fetch calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              adresse: "Station GPL",
              ville: "Annemasse",
              gplc_prix: 1.02,
              gplc_maj: "2025-01-01",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await getFuelPrice("gpl");
    await getFuelPrice("gpl");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // Regression test for #94: trips starting outside France must NOT hit
  // the French station API and must use the EU Oil Bulletin snapshot.
  it("uses EU Oil Bulletin snapshot for Belgian coordinates and skips French API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await getFuelPrice("sp95", 50.85, 4.35);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.fuelType).toBe("sp95");
    expect(result.priceEur).toBe(1.72);
    expect(result.stationName).toBe("EU Oil Bulletin (BE)");
  });

  it("uses EU snapshot for German diesel and still skips the French API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await getFuelPrice("diesel", 52.52, 13.4);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.priceEur).toBe(1.65);
    expect(result.stationName).toBe("EU Oil Bulletin (DE)");
  });

  it("falls back to French hardcoded average for coords outside any known country", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await getFuelPrice("sp95", 0, -30);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.priceEur).toBe(FALLBACK_PRICES.sp95);
    expect(result.stationName).toBeUndefined();
  });

  it("falls back to French hardcoded average when EU country has no price for the fuel type", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await getFuelPrice("e85", 50.85, 4.35);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.priceEur).toBe(FALLBACK_PRICES.e85);
    expect(result.stationName).toBeUndefined();
  });

  it("handles missing fuel-specific price field by falling back to hardcoded price", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ adresse: "NoPrix", ville: "Annemasse", e10_maj: "2025-01-01" }],
        }),
        { status: 200 },
      ),
    );

    const result = await getFuelPrice("sp95", 45.0, 2.0);

    expect(result.priceEur).toBe(FALLBACK_PRICES.sp95);
    expect(result.stationName).toBe("NoPrix, Annemasse");
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
