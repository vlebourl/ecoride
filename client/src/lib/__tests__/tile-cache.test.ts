import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_TILE_CACHE_NAME, clearTileCache, formatBytes, getTileCacheInfo } from "../tile-cache";

interface FakeCache {
  keys: () => Promise<Request[]>;
}

interface FakeCacheStorage {
  keys: () => Promise<string[]>;
  open: (name: string) => Promise<FakeCache>;
  delete: (name: string) => Promise<boolean>;
}

function makeCaches(config: {
  cacheNames: string[];
  entryCount: number;
  deleteResult?: boolean;
}): FakeCacheStorage {
  return {
    keys: async () => config.cacheNames,
    open: async () => ({
      // getTileCacheInfo only reads .length — avoid constructing real Request
      // objects (relative URLs throw under bun test env).
      keys: async () => Array.from({ length: config.entryCount }, () => ({}) as unknown as Request),
    }),
    delete: async () => config.deleteResult ?? true,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTileCacheInfo", () => {
  it("returns zero entries when caches API is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    const info = await getTileCacheInfo();
    expect(info).toEqual({ entries: 0, approxBytes: null });
  });

  it("returns zero entries when the tile cache does not exist yet", async () => {
    vi.stubGlobal("caches", makeCaches({ cacheNames: ["workbox-precache"], entryCount: 0 }));
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    const info = await getTileCacheInfo();
    expect(info.entries).toBe(0);
  });

  it("returns the key count of the ecoride tile cache", async () => {
    vi.stubGlobal(
      "caches",
      makeCaches({ cacheNames: ["workbox-precache", MAP_TILE_CACHE_NAME], entryCount: 42 }),
    );
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    const info = await getTileCacheInfo();
    expect(info.entries).toBe(42);
  });

  it("surfaces navigator.storage.estimate.usage when available", async () => {
    vi.stubGlobal("caches", makeCaches({ cacheNames: [MAP_TILE_CACHE_NAME], entryCount: 5 }));
    vi.stubGlobal("navigator", {
      ...navigator,
      storage: { estimate: async () => ({ usage: 1_234_567, quota: 50_000_000 }) },
    });
    const info = await getTileCacheInfo();
    expect(info.entries).toBe(5);
    expect(info.approxBytes).toBe(1_234_567);
  });

  it("does not throw when caches.open rejects", async () => {
    vi.stubGlobal("caches", {
      keys: async () => [MAP_TILE_CACHE_NAME],
      open: async () => {
        throw new Error("boom");
      },
      delete: async () => true,
    });
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    const info = await getTileCacheInfo();
    expect(info).toEqual({ entries: 0, approxBytes: null });
  });
});

describe("clearTileCache", () => {
  it("returns false when caches API is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await clearTileCache()).toBe(false);
  });

  it("delegates to caches.delete with the tile cache name", async () => {
    const deleteSpy = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", {
      keys: async () => [],
      open: async () => ({ keys: async () => [] }),
      delete: deleteSpy,
    });
    const result = await clearTileCache();
    expect(result).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith(MAP_TILE_CACHE_NAME);
  });

  it("returns false when caches.delete throws", async () => {
    vi.stubGlobal("caches", {
      keys: async () => [],
      open: async () => ({ keys: async () => [] }),
      delete: () => {
        throw new Error("boom");
      },
    });
    expect(await clearTileCache()).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats small byte counts as bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1024 * 500)).toBe("500 KB");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
});
