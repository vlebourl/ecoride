import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql, sum, desc, asc, and, gte, count } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { trips } from "../db/schema";
import { validationHook } from "../lib/validation";
import type { AuthEnv } from "../types/context";
import type { StatsPeriod } from "@ecoride/shared/api-contracts";

const leaderboardQuery = z.object({
  period: z.enum(["day", "week", "month", "year", "all"]).default("all"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  category: z.enum(["co2", "streak", "trips", "speed", "money", "distance"]).default("co2"),
});

function getPeriodStart(period: StatsPeriod): Date | null {
  if (period === "all") return null;
  const now = new Date();
  switch (period) {
    case "day":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + 1); // Monday
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
  }
}

/**
 * Format a Date as YYYY-MM-DD (UTC).
 */
function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Compute the current streak from an array of trip date strings (YYYY-MM-DD).
 * Dates should be unique. Returns the number of consecutive days ending today or yesterday.
 */
export function computeStreakFromDates(tripDates: string[]): number {
  if (tripDates.length === 0) return 0;

  const unique = [...new Set(tripDates)].sort().reverse();
  const today = dateToDay(new Date());
  const last = unique[0]!;

  const diffMs = new Date(today).getTime() - new Date(last).getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  // Streak counts only if the most recent trip was today or yesterday
  if (diffDays > 1) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]!);
    const curr = new Date(unique[i]!);
    const diff = Math.floor((prev.getTime() - curr.getTime()) / 86400000);
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Compute average speed in km/h from total distance (km) and total duration (seconds).
 * Returns 0 if duration is 0.
 */
export function computeAvgSpeedKmh(totalDistanceKm: number, totalDurationSec: number): number {
  if (totalDurationSec <= 0) return 0;
  const hours = totalDurationSec / 3600;
  return Math.round((totalDistanceKm / hours) * 10) / 10;
}

const leaderboardRouter = new Hono<AuthEnv>();

// GET /api/stats/leaderboard
leaderboardRouter.get("/", zValidator("query", leaderboardQuery, validationHook), async (c) => {
  const { period, limit, category } = c.req.valid("query");
  const currentUser = c.get("user");

  const periodStart = getPeriodStart(period);

  const conditions = [eq(user.leaderboardOptOut, false)];

  const joinCondition = periodStart
    ? and(eq(user.id, trips.userId), gte(trips.startedAt, periodStart))
    : eq(user.id, trips.userId);

  if (category === "co2") {
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

    const ranked = denseRank(entries, (e) => e.totalCo2SavedKg ?? 0);
    const mapped = ranked.map((e) => ({ ...e, value: e.totalCo2SavedKg }));

    const userRank = mapped.find((e) => e.userId === currentUser.id)?.rank ?? null;
    return c.json({ ok: true, data: { entries: mapped, userRank } });
  }

  if (category === "distance") {
    const entries = await db
      .select({
        userId: user.id,
        name: user.name,
        image: user.image,
        totalCo2SavedKg: sql<number>`coalesce(${sum(trips.co2SavedKg)}, 0)`.mapWith(Number),
        totalDistanceKm: sql<number>`coalesce(${sum(trips.distanceKm)}, 0)`.mapWith(Number),
      })
      .from(user)
      .leftJoin(trips, joinCondition)
      .where(and(...conditions))
      .groupBy(user.id, user.name, user.image)
      .orderBy(desc(sql`coalesce(${sum(trips.distanceKm)}, 0)`), asc(user.name))
      .limit(limit);

    const ranked = denseRank(entries, (e) => e.totalDistanceKm ?? 0);
    const mapped = ranked.map((e) => ({
      ...e,
      value: Math.round((e.totalDistanceKm ?? 0) * 10) / 10,
    }));

    const userRank = mapped.find((e) => e.userId === currentUser.id)?.rank ?? null;
    return c.json({ ok: true, data: { entries: mapped, userRank } });
  }

  if (category === "money") {
    const entries = await db
      .select({
        userId: user.id,
        name: user.name,
        image: user.image,
        totalCo2SavedKg: sql<number>`coalesce(${sum(trips.co2SavedKg)}, 0)`.mapWith(Number),
        totalMoneySaved: sql<number>`coalesce(${sum(trips.moneySavedEur)}, 0)`.mapWith(Number),
      })
      .from(user)
      .leftJoin(trips, joinCondition)
      .where(and(...conditions))
      .groupBy(user.id, user.name, user.image)
      .orderBy(desc(sql`coalesce(${sum(trips.moneySavedEur)}, 0)`), asc(user.name))
      .limit(limit);

    const ranked = denseRank(entries, (e) => e.totalMoneySaved ?? 0);
    const mapped = ranked.map((e) => ({
      ...e,
      value: Math.round((e.totalMoneySaved ?? 0) * 100) / 100,
    }));

    const userRank = mapped.find((e) => e.userId === currentUser.id)?.rank ?? null;
    return c.json({ ok: true, data: { entries: mapped, userRank } });
  }

  if (category === "trips") {
    const entries = await db
      .select({
        userId: user.id,
        name: user.name,
        image: user.image,
        totalCo2SavedKg: sql<number>`coalesce(${sum(trips.co2SavedKg)}, 0)`.mapWith(Number),
        tripCount: count(trips.id).mapWith(Number),
      })
      .from(user)
      .leftJoin(trips, joinCondition)
      .where(and(...conditions))
      .groupBy(user.id, user.name, user.image)
      .orderBy(desc(count(trips.id)), asc(user.name))
      .limit(limit);

    const ranked = denseRank(entries, (e) => e.tripCount);
    const mapped = ranked.map((e) => ({ ...e, value: e.tripCount }));

    const userRank = mapped.find((e) => e.userId === currentUser.id)?.rank ?? null;
    return c.json({ ok: true, data: { entries: mapped, userRank } });
  }

  if (category === "speed") {
    const entries = await db
      .select({
        userId: user.id,
        name: user.name,
        image: user.image,
        totalCo2SavedKg: sql<number>`coalesce(${sum(trips.co2SavedKg)}, 0)`.mapWith(Number),
        totalDistanceKm: sql<number>`coalesce(${sum(trips.distanceKm)}, 0)`.mapWith(Number),
        totalDurationSec: sql<number>`coalesce(${sum(trips.durationSec)}, 0)`.mapWith(Number),
        tripCount: count(trips.id).mapWith(Number),
      })
      .from(user)
      .leftJoin(trips, joinCondition)
      .where(and(...conditions))
      .groupBy(user.id, user.name, user.image)
      .limit(limit * 2); // fetch extra since we filter

    // Filter users with at least 1 trip, compute avg speed
    const withSpeed = entries
      .filter((e) => e.tripCount > 0)
      .map((e) => ({
        userId: e.userId,
        name: e.name,
        image: e.image,
        totalCo2SavedKg: e.totalCo2SavedKg,
        avgSpeedKmh: computeAvgSpeedKmh(e.totalDistanceKm, e.totalDurationSec),
      }))
      .sort((a, b) => b.avgSpeedKmh - a.avgSpeedKmh || a.name.localeCompare(b.name))
      .slice(0, limit);

    const ranked = denseRank(withSpeed, (e) => e.avgSpeedKmh);
    const mapped = ranked.map((e) => ({ ...e, value: e.avgSpeedKmh }));

    const userRank = mapped.find((e) => e.userId === currentUser.id)?.rank ?? null;
    return c.json({ ok: true, data: { entries: mapped, userRank } });
  }

  // category === "streak"
  // Fetch all opted-in users
  const optedInUsers = await db
    .select({
      userId: user.id,
      name: user.name,
      image: user.image,
    })
    .from(user)
    .where(and(...conditions));

  if (optedInUsers.length === 0) {
    return c.json({ ok: true, data: { entries: [], userRank: null } });
  }

  // Fetch all trip dates for opted-in users in a single query
  const userIds = optedInUsers.map((u) => u.userId);
  const tripDateConditions = periodStart
    ? and(sql`${trips.userId} IN ${userIds}`, gte(trips.startedAt, periodStart))
    : sql`${trips.userId} IN ${userIds}`;

  const tripRows = await db
    .select({
      userId: trips.userId,
      startedAt: trips.startedAt,
    })
    .from(trips)
    .where(tripDateConditions);

  // Also get co2 totals for opted-in users
  const co2Rows = await db
    .select({
      userId: user.id,
      totalCo2SavedKg: sql<number>`coalesce(${sum(trips.co2SavedKg)}, 0)`.mapWith(Number),
    })
    .from(user)
    .leftJoin(trips, joinCondition)
    .where(and(...conditions))
    .groupBy(user.id);

  const co2Map = new Map(co2Rows.map((r) => [r.userId, r.totalCo2SavedKg]));

  // Group trip dates by user
  const userTripDates = new Map<string, string[]>();
  for (const row of tripRows) {
    const day = dateToDay(row.startedAt);
    const existing = userTripDates.get(row.userId);
    if (existing) {
      existing.push(day);
    } else {
      userTripDates.set(row.userId, [day]);
    }
  }

  // Compute streaks for each user
  const withStreak = optedInUsers
    .map((u) => ({
      userId: u.userId,
      name: u.name,
      image: u.image,
      totalCo2SavedKg: co2Map.get(u.userId) ?? 0,
      streak: computeStreakFromDates(userTripDates.get(u.userId) ?? []),
    }))
    .sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name))
    .slice(0, limit);

  const ranked = denseRank(withStreak, (e) => e.streak);
  const mapped = ranked.map((e) => ({ ...e, value: e.streak }));

  const userRank = mapped.find((e) => e.userId === currentUser.id)?.rank ?? null;
  return c.json({ ok: true, data: { entries: mapped, userRank } });
});

/**
 * Assign dense ranks based on a value extractor.
 * Entries with the same value get the same rank.
 */
export function denseRank<T>(
  entries: T[],
  getValue: (entry: T) => number,
): (T & { rank: number })[] {
  let currentRank = 1;
  return entries.map((entry, idx) => {
    const val = getValue(entry);
    if (idx > 0 && val !== getValue(entries[idx - 1]!)) {
      currentRank = idx + 1;
    }
    return { ...entry, rank: currentRank };
  });
}

export { leaderboardRouter };
