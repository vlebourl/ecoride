import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sum, count, gte, and, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";
import { validationHook } from "../lib/validation";
import { computeStreak } from "../lib/streaks";
import { rateLimit } from "../lib/rate-limit";
import type { AuthEnv } from "../types/context";
import type {
  StatsPeriod,
  LeaderboardCategory,
  CommunityStatsResponse,
  CommunityTimelineResponse,
} from "@ecoride/shared/api-contracts";

const statsQuery = z.object({
  period: z.enum(["day", "week", "month", "year", "all"]).default("month"),
});

const communityStatsQuery = z.object({
  period: z.enum(["week", "month", "year", "all"]).default("all"),
});

// In-memory cache for community stats — keyed by period, TTL 5 minutes
const COMMUNITY_CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { data: CommunityStatsResponse; cachedAt: number };
const communityCache = new Map<StatsPeriod, CacheEntry>();

function getPeriodStart(period: StatsPeriod): Date | null {
  if (period === "all") return null;

  const now = new Date();
  switch (period) {
    case "day":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    case "week": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      return start;
    }
    case "month":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case "year":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  }
}

const statsRouter = new Hono<AuthEnv>();

// GET /api/stats/summary — Aggregated stats for current user
statsRouter.get("/summary", zValidator("query", statsQuery, validationHook), async (c) => {
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
});

// GET /api/stats/community — Cumulative community impact (all users)
statsRouter.get(
  "/community",
  rateLimit({ maxRequests: 30, windowMs: 60_000, prefix: "stats-community" }),
  zValidator("query", communityStatsQuery, validationHook),
  async (c) => {
    const { period } = c.req.valid("query");

    // Serve from cache if fresh
    const cached = communityCache.get(period);
    if (cached && Date.now() - cached.cachedAt < COMMUNITY_CACHE_TTL_MS) {
      return c.json({ ok: true, data: cached.data });
    }

    const periodStart = getPeriodStart(period);
    const conditions = periodStart ? [gte(trips.startedAt, periodStart)] : [];

    const [row] = await db
      .select({
        totalCo2SavedKg: sql<number>`coalesce(${sum(trips.co2SavedKg)}, 0)`.mapWith(Number),
        totalFuelSavedL: sql<number>`coalesce(${sum(trips.fuelSavedL)}, 0)`.mapWith(Number),
        totalMoneySavedEur: sql<number>`coalesce(${sum(trips.moneySavedEur)}, 0)`.mapWith(Number),
        totalDistanceKm: sql<number>`coalesce(${sum(trips.distanceKm)}, 0)`.mapWith(Number),
        activeUsers: sql<number>`count(distinct ${trips.userId})`.mapWith(Number),
        tripCount: count(),
      })
      .from(trips)
      .where(and(...conditions));

    const data: CommunityStatsResponse = {
      period,
      totalCo2SavedKg: row?.totalCo2SavedKg ?? 0,
      totalFuelSavedL: row?.totalFuelSavedL ?? 0,
      totalMoneySavedEur: row?.totalMoneySavedEur ?? 0,
      totalDistanceKm: row?.totalDistanceKm ?? 0,
      activeUsers: row?.activeUsers ?? 0,
      tripCount: row?.tripCount ?? 0,
      generatedAt: new Date().toISOString(),
    };

    communityCache.set(period, { data, cachedAt: Date.now() });

    return c.json({ ok: true, data });
  },
);

// ---- Community timeline ----

const timelineQuery = z.object({
  period: z.enum(["week", "month", "all"]).default("all"),
  category: z.enum(["co2", "trips", "distance", "money", "speed", "streak"]).default("co2"),
});

type TimelineCacheKey = `${string}-${string}`;
type TimelineCacheEntry = { data: CommunityTimelineResponse; cachedAt: number };
const timelineCache = new Map<TimelineCacheKey, TimelineCacheEntry>();

statsRouter.get(
  "/community/timeline",
  rateLimit({ maxRequests: 30, windowMs: 60_000, prefix: "stats-timeline" }),
  zValidator("query", timelineQuery, validationHook),
  async (c) => {
    const { period, category } = c.req.valid("query") as {
      period: StatsPeriod;
      category: LeaderboardCategory;
    };

    const cacheKey: TimelineCacheKey = `${period}-${category}`;
    const cached = timelineCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < COMMUNITY_CACHE_TTL_MS) {
      return c.json({ ok: true, data: cached.data });
    }

    const isAll = period === "all";
    const now = new Date();

    // Determine window start
    let windowStart: Date;
    if (isAll) {
      windowStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
    } else if (period === "month") {
      windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // SQL expressions — literals to avoid parameterization
    const dayLabel = isAll
      ? sql<string>`to_char(date_trunc('month', ${trips.startedAt}), 'YYYY-MM-DD')`
      : sql<string>`to_char(date_trunc('day', ${trips.startedAt}), 'YYYY-MM-DD')`;

    const dayLabelGroup = isAll
      ? sql`to_char(date_trunc('month', ${trips.startedAt}), 'YYYY-MM-DD')`
      : sql`to_char(date_trunc('day', ${trips.startedAt}), 'YYYY-MM-DD')`;

    let valueExpr;
    switch (category) {
      case "co2":
        valueExpr = sql<number>`coalesce(sum(${trips.co2SavedKg}), 0)`.mapWith(Number);
        break;
      case "money":
        valueExpr = sql<number>`coalesce(sum(${trips.moneySavedEur}), 0)`.mapWith(Number);
        break;
      case "distance":
        valueExpr = sql<number>`coalesce(sum(${trips.distanceKm}), 0)`.mapWith(Number);
        break;
      case "trips":
        valueExpr = sql<number>`count(*)`.mapWith(Number);
        break;
      case "speed":
        valueExpr =
          sql<number>`case when sum(${trips.durationSec}) > 0 then sum(${trips.distanceKm}) / (sum(${trips.durationSec}) / 3600.0) else 0 end`.mapWith(
            Number,
          );
        break;
      case "streak":
        valueExpr = sql<number>`count(distinct ${trips.userId})`.mapWith(Number);
        break;
      default:
        valueExpr = sql<number>`coalesce(sum(${trips.co2SavedKg}), 0)`.mapWith(Number);
    }

    const rows = await db
      .select({ day: dayLabel, value: valueExpr })
      .from(trips)
      .where(gte(trips.startedAt, windowStart))
      .groupBy(dayLabelGroup)
      .orderBy(dayLabelGroup);

    // Fill gaps with 0
    const map = new Map(rows.map((r) => [r.day ?? "", r.value]));
    const points: CommunityTimelineResponse["points"] = [];

    const cursor = new Date(windowStart);
    cursor.setUTCHours(0, 0, 0, 0);

    while (cursor <= now) {
      const key = isAll
        ? `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-01`
        : cursor.toISOString().slice(0, 10);

      if (points.at(-1)?.date !== key) {
        points.push({ date: key, value: map.get(key) ?? 0 });
      }

      if (isAll) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      } else {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    const data: CommunityTimelineResponse = { period, category, points };
    timelineCache.set(cacheKey, { data, cachedAt: Date.now() });

    return c.json({ ok: true, data });
  },
);

export { statsRouter };
