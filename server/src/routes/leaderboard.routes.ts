import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql, sum, desc, asc, and, gte } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { trips } from "../db/schema";
import { validationHook } from "../lib/validation";
import type { AuthEnv } from "../types/context";
import type { StatsPeriod } from "@ecoride/shared/api-contracts";

const leaderboardQuery = z.object({
  period: z.enum(["day", "week", "month", "year", "all"]).default("all"),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

function getPeriodStart(period: StatsPeriod): Date | null {
  if (period === "all") return null;
  const now = new Date();
  switch (period) {
    case "day": return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + 1); // Monday
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year": return new Date(now.getFullYear(), 0, 1);
  }
}

const leaderboardRouter = new Hono<AuthEnv>();

// GET /api/stats/leaderboard
leaderboardRouter.get(
  "/",
  zValidator("query", leaderboardQuery, validationHook),
  async (c) => {
    const { period, limit } = c.req.valid("query");
    const currentUser = c.get("user");

    const periodStart = getPeriodStart(period);

    const conditions = [eq(user.leaderboardOptOut, false)];
    const tripConditions = periodStart
      ? [gte(trips.startedAt, periodStart)]
      : [];

    const joinCondition = periodStart
      ? and(eq(user.id, trips.userId), gte(trips.startedAt, periodStart))
      : eq(user.id, trips.userId);

    const entries = await db
      .select({
        userId: user.id,
        name: user.name,
        image: user.image,
        totalCo2SavedKg: sql<number>`coalesce(${sum(trips.co2SavedKg)}, 0)`.mapWith(Number),
      })
      .from(user)
      .leftJoin(trips, joinCondition)
      .where(and(...conditions))
      .groupBy(user.id, user.name, user.image)
      .orderBy(desc(sql`coalesce(${sum(trips.co2SavedKg)}, 0)`), asc(user.name))
      .limit(limit);

    // Dense ranking: tied users share the same rank
    let currentRank = 1;
    const ranked = entries.map((entry, idx) => {
      const co2 = entry.totalCo2SavedKg ?? 0;
      if (idx > 0 && co2 !== (entries[idx - 1].totalCo2SavedKg ?? 0)) {
        currentRank = idx + 1;
      }
      return { ...entry, totalCo2SavedKg: co2, rank: currentRank };
    });

    // Find current user's rank
    const userRank = ranked.find((e) => e.userId === currentUser.id)?.rank ?? null;

    return c.json({ ok: true, data: { entries: ranked, userRank } });
  },
);

export { leaderboardRouter };
