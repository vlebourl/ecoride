import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

type SummaryRow = {
  totalDistanceKm: number;
  totalCo2SavedKg: number;
  totalMoneySavedEur: number;
  totalFuelSavedL: number;
  tripCount: number;
  activeUsers: number;
};

type TimelineRow = { day: string; value: number };

const mocks = vi.hoisted(() => {
  let whereRows: SummaryRow[] = [
    {
      totalDistanceKm: 12.3,
      totalCo2SavedKg: 1.234,
      totalMoneySavedEur: 2.5,
      totalFuelSavedL: 0.7,
      tripCount: 2,
      activeUsers: 1,
    },
  ];
  let timelineRows: TimelineRow[] = [];

  const mockOrderBy = vi.fn(() => Promise.resolve(timelineRows));
  const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockWhere = vi.fn(() => {
    const promise = Promise.resolve(whereRows);

    return {
      groupBy: mockGroupBy,
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
      [Symbol.toStringTag]: "Promise",
    };
  });
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockComputeStreak = vi.fn().mockResolvedValue({ current: 4, longest: 9 });

  return {
    mockWhere,
    mockFrom,
    mockSelect,
    mockComputeStreak,
    mockGroupBy,
    mockOrderBy,
    setWhereRows: (rows: SummaryRow[]) => {
      whereRows = rows;
    },
    setTimelineRows: (rows: TimelineRow[]) => {
      timelineRows = rows;
    },
  };
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
    durationSec: {},
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
    mocks.mockGroupBy.mockClear();
    mocks.mockOrderBy.mockClear();
    mocks.mockComputeStreak.mockClear();
    mocks.setWhereRows([
      {
        totalDistanceKm: 12.3,
        totalCo2SavedKg: 1.234,
        totalMoneySavedEur: 2.5,
        totalFuelSavedL: 0.7,
        tripCount: 2,
        activeUsers: 1,
      },
    ]);
    mocks.setTimelineRows([]);
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
    vi.advanceTimersByTime(6 * 60 * 1000);
    mocks.mockSelect.mockClear();
    mocks.mockFrom.mockClear();
    mocks.mockWhere.mockClear();
    mocks.mockGroupBy.mockClear();
    mocks.mockOrderBy.mockClear();
    mocks.mockComputeStreak.mockClear();
    mocks.setWhereRows([communityRow]);
    mocks.setTimelineRows([]);
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
    mocks.setWhereRows([
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

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await app.request("/stats/community?period=week");
    expect(mocks.mockSelect).toHaveBeenCalledTimes(1);
  });
});

describe("GET /stats/community/timeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00.000Z"));
    mocks.mockSelect.mockClear();
    mocks.mockFrom.mockClear();
    mocks.mockWhere.mockClear();
    mocks.mockGroupBy.mockClear();
    mocks.mockOrderBy.mockClear();
    mocks.setWhereRows([]);
    mocks.setTimelineRows([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills missing daily points with zeros for trip counts", async () => {
    mocks.setTimelineRows([
      { day: "2026-06-05", value: 3 },
      { day: "2026-06-07", value: 1 },
      { day: "2026-06-12", value: 4 },
    ]);

    const res = await buildApp().request("/stats/community/timeline?period=week&category=trips");
    const body = (await res.json()) as {
      ok: boolean;
      data: { period: string; category: string; points: Array<{ date: string; value: number }> };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.period).toBe("week");
    expect(body.data.category).toBe("trips");
    expect(body.data.points).toEqual([
      { date: "2026-06-05", value: 3 },
      { date: "2026-06-06", value: 0 },
      { date: "2026-06-07", value: 1 },
      { date: "2026-06-08", value: 0 },
      { date: "2026-06-09", value: 0 },
      { date: "2026-06-10", value: 0 },
      { date: "2026-06-11", value: 0 },
      { date: "2026-06-12", value: 4 },
    ]);
    expect(mocks.mockOrderBy).toHaveBeenCalledTimes(1);
  });

  it("uses monthly buckets for all-time streak timelines", async () => {
    mocks.setTimelineRows([
      { day: "2025-06-01", value: 2 },
      { day: "2025-08-01", value: 5 },
      { day: "2026-06-01", value: 9 },
    ]);

    const res = await buildApp().request("/stats/community/timeline?period=all&category=streak");
    const body = (await res.json()) as {
      ok: boolean;
      data: { period: string; category: string; points: Array<{ date: string; value: number }> };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.period).toBe("all");
    expect(body.data.category).toBe("streak");
    expect(body.data.points[0]).toEqual({ date: "2025-06-01", value: 2 });
    expect(body.data.points[1]).toEqual({ date: "2025-07-01", value: 0 });
    expect(body.data.points[2]).toEqual({ date: "2025-08-01", value: 5 });
    expect(body.data.points.at(-1)).toEqual({ date: "2026-06-01", value: 9 });
    expect(body.data.points).toHaveLength(13);
  });

  it.each(["co2", "money", "distance", "speed"] as const)(
    "builds %s timelines without falling back to the default branch",
    async (category) => {
      mocks.setTimelineRows([{ day: "2026-05-13", value: 7.5 }]);

      const res = await buildApp().request(
        `/stats/community/timeline?period=month&category=${category}`,
      );
      const body = (await res.json()) as {
        ok: boolean;
        data: { category: string; points: Array<{ date: string; value: number }> };
      };

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.category).toBe(category);
      expect(body.data.points[0]).toEqual({ date: "2026-05-13", value: 7.5 });
      expect(body.data.points.at(-1)).toEqual({ date: "2026-06-12", value: 0 });
    },
  );

  it("serves the second identical timeline request from cache", async () => {
    mocks.setTimelineRows([{ day: "2026-06-05", value: 2 }]);
    const app = buildApp();

    await app.request("/stats/community/timeline?period=week&category=co2");
    mocks.mockSelect.mockClear();

    const res = await app.request("/stats/community/timeline?period=week&category=co2");
    expect(res.status).toBe(200);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });
});
