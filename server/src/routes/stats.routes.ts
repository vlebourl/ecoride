import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sum, count, gte, and, desc } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";
import { validationHook } from "../lib/validation";
import type { AuthEnv } from "../types/context";
import type { StatsPeriod } from "@ecoride/shared/api-contracts";

const statsQuery = z.object({
  period: z.enum(["day", "week", "month", "year", "all"]).default("month"),
});

function getPeriodStart(period: StatsPeriod): Date | null {
  if (period === "all") return null;
  const now = new Date();
  switch (period) {
    case "day": return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year": return new Date(now.getFullYear(), 0, 1);
  }
}

/**
 * Compute the current streak (consecutive days with at least one trip).
 */
async function computeStreak(userId: string): Promise<{ current: number; longest: number }> {
  // Get distinct trip dates ordered descending
  const rows = await db
    .selectDistinctOn([trips.startedAt], {
      date: trips.startedAt,
    })
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(desc(trips.startedAt));

  if (rows.length === 0) return { current: 0, longest: 0 };

  // Extract unique dates (YYYY-MM-DD)
  const dateSet = new Set<string>();
  for (const row of rows) {
    dateSet.add(row.date.toISOString().slice(0, 10));
  }
  const dates = Array.from(dateSet).sort().reverse();

  let current = 0;
  let longest = 0;
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]!;
    if (i === 0) {
      // Streak counts only if the most recent trip was today or yesterday
      const diffDays = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
      if (diffDays > 1) {
        current = 0;
        streak = 1;
      } else {
        streak = 1;
        current = 1;
      }
    } else {
      const prev = new Date(dates[i - 1]!);
      const curr = new Date(d);
      const diff = Math.floor((prev.getTime() - curr.getTime()) / 86400000);
      if (diff === 1) {
        streak++;
        if (current > 0) current = streak;
      } else {
        longest = Math.max(longest, streak);
        streak = 1;
        if (current > 0) {
          // Break in the current streak
        }
        current = current > 0 ? current : 0;
      }
    }
  }
  longest = Math.max(longest, streak);

  return { current, longest };
}

const statsRouter = new Hono<AuthEnv>();

// GET /api/stats/summary — Aggregated stats for current user
statsRouter.get(
  "/summary",
  zValidator("query", statsQuery, validationHook),
  async (c) => {
    const { period } = c.req.valid("query");
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

    const streaks = await computeStreak(currentUser.id);

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
  },
);

export { statsRouter };
