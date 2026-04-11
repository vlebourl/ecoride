import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue([
    {
      totalDistanceKm: 12.3,
      totalCo2SavedKg: 1.234,
      totalMoneySavedEur: 2.5,
      totalFuelSavedL: 0.7,
      tripCount: 2,
      activeUsers: 1,
    },
  ]);
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockComputeStreak = vi.fn().mockResolvedValue({ current: 4, longest: 9 });
  return { mockWhere, mockFrom, mockSelect, mockComputeStreak };
});

vi.mock("../../db", () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

vi.mock("../../db/schema", () => ({
  trips: {
    userId: {},
    startedAt: {},
    distanceKm: {},
    co2SavedKg: {},
    moneySavedEur: {},
    fuelSavedL: {},
  },
}));

vi.mock("../../lib/streaks", () => ({
  computeStreak: mocks.mockComputeStreak,
}));

import { statsRouter } from "../stats.routes";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", timezone: "Europe/Paris" } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/stats", statsRouter);
  return app;
}

describe("GET /stats/summary", () => {
  beforeEach(() => {
    mocks.mockSelect.mockClear();
    mocks.mockFrom.mockClear();
    mocks.mockWhere.mockClear();
    mocks.mockComputeStreak.mockClear();
    mocks.mockWhere.mockResolvedValue([
      {
        totalDistanceKm: 12.3,
        totalCo2SavedKg: 1.234,
        totalMoneySavedEur: 2.5,
        totalFuelSavedL: 0.7,
        tripCount: 2,
        activeUsers: 1,
      },
    ]);
    mocks.mockComputeStreak.mockResolvedValue({ current: 4, longest: 9 });
  });

  it("computes streaks in UTC and ignores timezone-like query noise", async () => {
    const res = await buildApp().request("/stats/summary?period=week&tz=UTC");
    const body = (await res.json()) as {
      ok: boolean;
      data: { currentStreak: number; longestStreak: number };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.currentStreak).toBe(4);
    expect(body.data.longestStreak).toBe(9);
    expect(mocks.mockComputeStreak).toHaveBeenCalledWith("user-1");
  });
});

describe("GET /stats/community", () => {
  const communityRow = {
    totalCo2SavedKg: 12500,
    totalFuelSavedL: 5400,
    totalMoneySavedEur: 8100,
    totalDistanceKm: 45000,
    activeUsers: 42,
    tripCount: 312,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Advance past TTL to ensure no stale cache from previous tests
    vi.advanceTimersByTime(6 * 60 * 1000);
    mocks.mockSelect.mockClear();
    mocks.mockFrom.mockClear();
    mocks.mockWhere.mockClear();
    mocks.mockComputeStreak.mockClear();
    mocks.mockWhere.mockResolvedValue([communityRow]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns cumulative community totals for period=all", async () => {
    const res = await buildApp().request("/stats/community?period=all");
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        period: string;
        totalCo2SavedKg: number;
        totalFuelSavedL: number;
        totalMoneySavedEur: number;
        totalDistanceKm: number;
        activeUsers: number;
        tripCount: number;
        generatedAt: string;
      };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.period).toBe("all");
    expect(body.data.totalCo2SavedKg).toBe(12500);
    expect(body.data.activeUsers).toBe(42);
    expect(body.data.tripCount).toBe(312);
    expect(body.data.generatedAt).toBeDefined();
    expect(mocks.mockSelect).toHaveBeenCalledTimes(1);
  });

  it("returns zeros when no trips exist (coalesce safety)", async () => {
    mocks.mockWhere.mockResolvedValue([
      {
        totalCo2SavedKg: 0,
        totalFuelSavedL: 0,
        totalMoneySavedEur: 0,
        totalDistanceKm: 0,
        activeUsers: 0,
        tripCount: 0,
      },
    ]);

    const res = await buildApp().request("/stats/community?period=month");
    const body = (await res.json()) as { ok: boolean; data: { totalCo2SavedKg: number } };

    expect(res.status).toBe(200);
    expect(body.data.totalCo2SavedKg).toBe(0);
  });

  it("serves cache on second call without hitting db again", async () => {
    const app = buildApp();
    await app.request("/stats/community?period=year");
    mocks.mockSelect.mockClear();

    await app.request("/stats/community?period=year");

    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });

  it("re-queries after cache TTL expires", async () => {
    const app = buildApp();
    await app.request("/stats/community?period=week");
    mocks.mockSelect.mockClear();

    // Advance time past the 5-minute TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await app.request("/stats/community?period=week");
    expect(mocks.mockSelect).toHaveBeenCalledTimes(1);
  });
});
