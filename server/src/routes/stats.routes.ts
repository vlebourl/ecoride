import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sum, count, gte, and } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";
import { validationHook } from "../lib/validation";
import { computeStreak } from "../lib/streaks";
import type { AuthEnv } from "../types/context";
import type { StatsPeriod } from "@ecoride/shared/api-contracts";

const statsQuery = z.object({
  period: z.enum(["day", "week", "month", "year", "all"]).default("month"),
  tz: z.string().optional(),
});

function getPeriodStart(period: StatsPeriod): Date | null {
  if (period === "all") return null;
  const now = new Date();
  switch (period) {
    case "day":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
  }
}

const statsRouter = new Hono<AuthEnv>();

// GET /api/stats/summary — Aggregated stats for current user
statsRouter.get("/summary", zValidator("query", statsQuery, validationHook), async (c) => {
  const { period, tz } = c.req.valid("query");
  const currentUser = c.get("user");

  const periodStart = getPeriodStart(period);
  const conditions = [eq(trips.userId, currentUser.id)];
  if (periodStart) conditions.push(gte(trips.startedAt, periodStart));

  const [stats] = await db
    .select({
      totalDistanceKm: sum(trips.distanceKm).mapWith(Number),
      totalCo2SavedKg: sum(trips.co2SavedKg).mapWith(Number),
      totalMoneySavedEur: sum(trips.moneySavedEur).mapWith(Number),
      totalFuelSavedL: sum(trips.fuelSavedL).mapWith(Number),
      tripCount: count(),
    })
    .from(trips)
    .where(and(...conditions));

  const streaks = await computeStreak(currentUser.id, tz);

  return c.json({
    ok: true,
    data: {
      totalDistanceKm: stats?.totalDistanceKm ?? 0,
      totalCo2SavedKg: stats?.totalCo2SavedKg ?? 0,
      totalMoneySavedEur: stats?.totalMoneySavedEur ?? 0,
      totalFuelSavedL: stats?.totalFuelSavedL ?? 0,
      tripCount: stats?.tripCount ?? 0,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
    },
  });
});

export { statsRouter };
