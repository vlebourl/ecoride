import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

/**
 * Garde-fou d'équivalence : les badges (`collectUserStats`) et la carte de défi
 * (`GET /api/stats/summary`) doivent tirer leurs sommes journalières de la MÊME
 * fonction. Tant que les deux portaient une copie textuelle de la requête, une
 * modification de l'une sans l'autre passait typecheck et suite de tests, et se
 * traduisait en prod par un badge et une carte se contredisant sur la même
 * semaine.
 *
 * Ce test mord si l'un des deux sites réinline sa propre requête journalière.
 * Ce qu'il ne couvre PAS : la correction du SQL lui-même (aucune base réelle
 * n'est sollicitée ici) — voir daily-rollup.test.ts pour la forme de la
 * requête, et le triage n°1 de la revue pour la validation SQL en CI.
 */

const mocks = vi.hoisted(() => {
  const fetchDailyRows = vi.fn().mockResolvedValue([
    { day: "2026-07-20", distanceKm: 30, co2Kg: 5, tripCount: 3 },
    { day: "2026-07-21", distanceKm: 25, co2Kg: 4, tripCount: 2 },
  ]);
  // Une seule ligne sert à la fois de profil (timezone) et d'agrégat : les deux
  // requêtes non journalières se terminent sur `where()`.
  const row = {
    timezone: "Europe/Paris",
    totalDistanceKm: 55,
    totalCo2SavedKg: 9,
    totalMoneySavedEur: 7,
    totalFuelSavedL: 4,
    tripCount: 5,
    maxTripDistanceKm: 20,
    maxTripDurationSec: 3600,
    maxTripSpeedKmh: 22,
    earlyTripCount: 0,
    nightTripCount: 0,
    weekendTripCount: 0,
    distinctWeekdayCount: 2,
  };
  const where = vi.fn().mockResolvedValue([row]);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { fetchDailyRows, select, from, where };
});

vi.mock("../daily-rollup", () => ({ fetchDailyRows: mocks.fetchDailyRows }));
vi.mock("../../db", () => ({ db: { select: mocks.select } }));
vi.mock("../../db/schema", () => ({
  trips: {
    userId: {},
    startedAt: {},
    distanceKm: {},
    durationSec: {},
    co2SavedKg: {},
    moneySavedEur: {},
    fuelSavedL: {},
  },
  achievements: { userId: {}, badgeId: {} },
  user: { id: {}, timezone: {} },
}));
vi.mock("../streaks", () => ({
  computeStreak: vi.fn().mockResolvedValue({ current: 2, longest: 9 }),
}));

import { collectUserStats } from "../badges";
import { statsRouter } from "../../routes/stats.routes";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", timezone: "Europe/Paris" } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/stats", statsRouter);
  return app;
}

describe("fetchDailyRows partagée par les badges et la carte de défi", () => {
  beforeEach(() => mocks.fetchDailyRows.mockClear());

  it("collectUserStats passe par fetchDailyRows", async () => {
    await collectUserStats("user-1");
    expect(mocks.fetchDailyRows).toHaveBeenCalledTimes(1);
    expect(mocks.fetchDailyRows).toHaveBeenCalledWith("user-1");
  });

  it("GET /stats/summary passe par fetchDailyRows", async () => {
    const res = await buildApp().request("/stats/summary?period=month");
    expect(res.status).toBe(200);
    expect(mocks.fetchDailyRows).toHaveBeenCalledTimes(1);
    expect(mocks.fetchDailyRows).toHaveBeenCalledWith("user-1");
  });

  it("les lignes partagées alimentent bien les stats dérivées des badges", async () => {
    // Les deux sites consomment la même sortie via computeDerivedStats : ce qui
    // sort de fetchDailyRows se retrouve tel quel dans les seuils de badges.
    const stats = await collectUserStats("user-1");
    expect(stats.maxDayDistanceKm).toBe(30);
  });
});
