import { describe, expect, it, vi, beforeEach } from "vitest";
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
      },
    ]);
    mocks.mockComputeStreak.mockResolvedValue({ current: 4, longest: 9 });
  });

  it("uses the persisted user timezone instead of a query parameter", async () => {
    const res = await buildApp().request("/stats/summary?period=week&tz=UTC");
    const body = (await res.json()) as {
      ok: boolean;
      data: { currentStreak: number; longestStreak: number };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.currentStreak).toBe(4);
    expect(body.data.longestStreak).toBe(9);
    expect(mocks.mockComputeStreak).toHaveBeenCalledWith("user-1", "Europe/Paris");
  });
});
