import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  // `where()` termine la requête pour l'agrégat simple (summary, community), mais
  // la requête journalière des défis ajoute `.groupBy()`. On renvoie donc un
  // thenable qui porte aussi `groupBy`, pour couvrir les deux formes avec un seul
  // mock de `where` — voir server/src/lib/__tests__/badges-db.test.ts pour le même
  // pattern côté collectUserStats.
  function makeTerminal(rows: unknown[], dailyRows: unknown[] = []) {
    const groupBy = vi.fn().mockResolvedValue(dailyRows);
    return Object.assign(Promise.resolve(rows), { groupBy });
  }

  const mockWhere = vi.fn().mockReturnValue(
    makeTerminal([
      {
        totalDistanceKm: 12.3,
        totalCo2SavedKg: 1.234,
        totalMoneySavedEur: 2.5,
        totalFuelSavedL: 0.7,
        tripCount: 2,
        activeUsers: 1,
      },
    ]),
  );
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockComputeStreak = vi.fn().mockResolvedValue({ current: 4, longest: 9 });
  return { mockWhere, mockFrom, mockSelect, mockComputeStreak, makeTerminal };
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
    mocks.mockWhere.mockReturnValue(
      mocks.makeTerminal([
        {
          totalDistanceKm: 12.3,
          totalCo2SavedKg: 1.234,
          totalMoneySavedEur: 2.5,
          totalFuelSavedL: 0.7,
          tripCount: 2,
          activeUsers: 1,
        },
      ]),
    );
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

  it("expose la progression des défis hebdo et mensuel, calculée depuis les sommes journalières", async () => {
    // "Aujourd'hui" = mercredi 2025-01-15. Semaine ISO en cours: lundi
    // 2025-01-13 -> dimanche 2025-01-19. Mois en cours: 2025-01.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    mocks.mockWhere.mockReturnValue(
      mocks.makeTerminal(
        [
          {
            totalDistanceKm: 12.3,
            totalCo2SavedKg: 1.234,
            totalMoneySavedEur: 2.5,
            totalFuelSavedL: 0.7,
            tripCount: 2,
            activeUsers: 1,
          },
        ],
        [
          // Deux jours dans la semaine ET le mois en cours.
          { day: "2025-01-13", distanceKm: 20, co2Kg: 2, tripCount: 1 },
          { day: "2025-01-14", distanceKm: 15, co2Kg: 1.5, tripCount: 1 },
          // Un jour hors semaine mais toujours dans le mois — ne doit compter
          // que dans `month`, pas dans `week`.
          { day: "2025-01-02", distanceKm: 5, co2Kg: 0.5, tripCount: 1 },
          // Un jour hors semaine ET hors mois — ne doit compter nulle part.
          { day: "2024-12-01", distanceKm: 100, co2Kg: 10, tripCount: 5 },
        ],
      ),
    );

    try {
      const res = await buildApp().request("/stats/summary");
      const body = (await res.json()) as {
        ok: boolean;
        data: {
          challenges: {
            week: {
              distanceKm: number;
              goalKm: number;
              tripCount: number;
              activeDays: number;
              co2Kg: number;
            };
            month: {
              distanceKm: number;
              goalKm: number;
              tripCount: number;
              activeDays: number;
              co2Kg: number;
            };
          };
        };
      };

      expect(res.status).toBe(200);
      // Passthrough des constantes de production (WEEKLY_GOAL_KM / MONTHLY_GOAL_KM) :
      // structurel, mais confirme que la route branche bien computeDerivedStats et
      // non une valeur codée en dur dans la route elle-même.
      expect(body.data.challenges.week.goalKm).toBe(50);
      expect(body.data.challenges.month.goalKm).toBe(250);
      // Ce qui suit est calculé par la route à partir des lignes journalières
      // simulées ci-dessus — ce n'est PAS une valeur que le mock a fournie
      // directement, donc ça pin le vrai calcul (agrégation + repli ISO-semaine).
      expect(body.data.challenges.week.distanceKm).toBe(35); // 20 + 15, exclut le 02/01 et le 01/12
      expect(body.data.challenges.week.tripCount).toBe(2);
      expect(body.data.challenges.week.activeDays).toBe(2);
      expect(body.data.challenges.week.co2Kg).toBeCloseTo(3.5);
      expect(body.data.challenges.month.distanceKm).toBe(40); // 20 + 15 + 5, exclut le 01/12
      expect(body.data.challenges.month.tripCount).toBe(3);
      expect(body.data.challenges.month.activeDays).toBe(3);
    } finally {
      vi.useRealTimers();
    }
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
