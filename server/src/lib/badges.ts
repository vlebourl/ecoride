import { eq, and, sum, count, max, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import { trips, achievements, user } from "../db/schema";
import { computeStreak } from "./streaks";
import { computeDerivedStats, type DailyRow } from "./derived-stats";
import { normalizeTimezone } from "./timezone";
import type { BadgeId } from "@ecoride/shared/types";

/**
 * Badge threshold definitions.
 * Each entry maps a BadgeId to a predicate over the user's aggregate stats.
 */
export interface UserStats {
  totalDistanceKm: number;
  totalCo2SavedKg: number;
  totalMoneySavedEur: number;
  totalFuelSavedL: number;
  tripCount: number;
  /** Plus longue série jamais réalisée. Les badges streak s'appuient dessus, pas sur la série en cours. */
  longestStreak: number;
  maxTripDistanceKm: number;
  maxTripDurationSec: number;
  /** Vitesse du meilleur trajet d'au moins 5 km. Sous ce seuil, une descente courte fausserait tout. */
  maxTripSpeedKmh: number;
  maxDayDistanceKm: number;
  monthsActive: number;
  /** Trajets démarrés avant 7 h — heure LOCALE, seule exception à la règle UTC-only du backend. */
  earlyTripCount: number;
  /** Trajets démarrés à 21 h ou après — heure LOCALE. */
  nightTripCount: number;
  weekendTripCount: number;
  /** Nombre de jours de la semaine distincts (UTC). 7 = all_week. */
  distinctWeekdayCount: number;
  weeklyGoalsMet: number;
  monthlyGoalsMet: number;
}

export const BADGE_THRESHOLDS: Record<BadgeId, (s: UserStats) => boolean> = {
  // Volume
  first_trip: (s) => s.tripCount >= 1,
  trips_10: (s) => s.tripCount >= 10,
  trips_50: (s) => s.tripCount >= 50,
  trips_100: (s) => s.tripCount >= 100,
  trips_250: (s) => s.tripCount >= 250,
  trips_500: (s) => s.tripCount >= 500,
  km_100: (s) => s.totalDistanceKm >= 100,
  km_500: (s) => s.totalDistanceKm >= 500,
  km_1000: (s) => s.totalDistanceKm >= 1000,
  km_2500: (s) => s.totalDistanceKm >= 2500,
  km_5000: (s) => s.totalDistanceKm >= 5000,
  km_10000: (s) => s.totalDistanceKm >= 10000,

  // Impact
  co2_10kg: (s) => s.totalCo2SavedKg >= 10,
  co2_100kg: (s) => s.totalCo2SavedKg >= 100,
  co2_250kg: (s) => s.totalCo2SavedKg >= 250,
  co2_500kg: (s) => s.totalCo2SavedKg >= 500,
  co2_1t: (s) => s.totalCo2SavedKg >= 1000,
  fuel_25l: (s) => s.totalFuelSavedL >= 25,
  fuel_50l: (s) => s.totalFuelSavedL >= 50,
  fuel_100l: (s) => s.totalFuelSavedL >= 100,
  fuel_250l: (s) => s.totalFuelSavedL >= 250,
  money_100: (s) => s.totalMoneySavedEur >= 100,
  money_250: (s) => s.totalMoneySavedEur >= 250,
  money_500: (s) => s.totalMoneySavedEur >= 500,
  money_1000: (s) => s.totalMoneySavedEur >= 1000,

  // Régularité — sur longestStreak, pas sur la série en cours
  streak_3: (s) => s.longestStreak >= 3,
  streak_7: (s) => s.longestStreak >= 7,
  streak_14: (s) => s.longestStreak >= 14,
  streak_30: (s) => s.longestStreak >= 30,
  streak_100: (s) => s.longestStreak >= 100,
  months_active_6: (s) => s.monthsActive >= 6,
  months_active_12: (s) => s.monthsActive >= 12,
  weekly_goal_10: (s) => s.weeklyGoalsMet >= 10,
  monthly_goal_3: (s) => s.monthlyGoalsMet >= 3,

  // Records
  day_30: (s) => s.maxDayDistanceKm >= 30,
  day_50: (s) => s.maxDayDistanceKm >= 50,
  trip_25: (s) => s.maxTripDistanceKm >= 25,
  trip_50: (s) => s.maxTripDistanceKm >= 50,
  trip_2h: (s) => s.maxTripDurationSec >= 7200,

  // Habitudes
  early_bird: (s) => s.earlyTripCount >= 10,
  night_owl: (s) => s.nightTripCount >= 10,
  weekend_20: (s) => s.weekendTripCount >= 20,
  all_week: (s) => s.distinctWeekdayCount >= 7,

  // Performance
  speed_20: (s) => s.maxTripSpeedKmh >= 20,
  speed_22: (s) => s.maxTripSpeedKmh >= 22,
  speed_25: (s) => s.maxTripSpeedKmh >= 25,
};

/**
 * Agrège toutes les métriques dont dépendent les badges.
 *
 * Trois requêtes :
 *   A — agrégat une-ligne (sommes, maxima, compteurs d'habitudes)
 *   B — sommes par jour UTC, repliées en TypeScript par computeDerivedStats
 *   C — computeStreak, dont on ne garde que `longest`
 */
export async function collectUserStats(userId: string): Promise<UserStats> {
  const [profile] = await db
    .select({ timezone: user.timezone })
    .from(user)
    .where(eq(user.id, userId));

  // Seule exception à la règle UTC-only du backend : l'heure de la journée est
  // intrinsèquement locale, sinon "avant 7 h" devient "avant 9 h" à Paris en été.
  const tz = normalizeTimezone(profile?.timezone);
  const localHour = sql<number>`EXTRACT(hour FROM ${trips.startedAt} AT TIME ZONE ${tz}::text)`;
  const utcDow = sql<number>`EXTRACT(dow FROM ${trips.startedAt} AT TIME ZONE 'UTC')`;

  const [agg] = await db
    .select({
      totalDistanceKm: sum(trips.distanceKm).mapWith(Number),
      totalCo2SavedKg: sum(trips.co2SavedKg).mapWith(Number),
      totalMoneySavedEur: sum(trips.moneySavedEur).mapWith(Number),
      totalFuelSavedL: sum(trips.fuelSavedL).mapWith(Number),
      tripCount: count(),
      maxTripDistanceKm: max(trips.distanceKm).mapWith(Number),
      maxTripDurationSec: max(trips.durationSec).mapWith(Number),
      // Seuls les trajets d'au moins 5 km comptent : sinon une descente de 500 m
      // à 40 km/h débloquerait speed_25.
      maxTripSpeedKmh: sql<number>`coalesce(max(
        case when ${trips.distanceKm} >= 5 and ${trips.durationSec} > 0
        then ${trips.distanceKm} / (${trips.durationSec} / 3600.0)
        end
      ), 0)`.mapWith(Number),
      earlyTripCount: sql<number>`count(*) filter (where ${localHour} < 7)`.mapWith(Number),
      nightTripCount: sql<number>`count(*) filter (where ${localHour} >= 21)`.mapWith(Number),
      weekendTripCount: sql<number>`count(*) filter (where ${utcDow} in (0, 6))`.mapWith(Number),
      distinctWeekdayCount: sql<number>`count(distinct ${utcDow})`.mapWith(Number),
    })
    .from(trips)
    .where(eq(trips.userId, userId));

  const dayExpr = sql<string>`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`;
  const dailyRows: DailyRow[] = await db
    .select({
      day: dayExpr.as("day"),
      distanceKm: sum(trips.distanceKm).mapWith(Number),
      co2Kg: sum(trips.co2SavedKg).mapWith(Number),
      tripCount: count(),
    })
    .from(trips)
    .where(eq(trips.userId, userId))
    .groupBy(dayExpr);

  const derived = computeDerivedStats(dailyRows, new Date().toISOString().slice(0, 10));
  const streaks = await computeStreak(userId);

  return {
    totalDistanceKm: agg?.totalDistanceKm ?? 0,
    totalCo2SavedKg: agg?.totalCo2SavedKg ?? 0,
    totalMoneySavedEur: agg?.totalMoneySavedEur ?? 0,
    totalFuelSavedL: agg?.totalFuelSavedL ?? 0,
    tripCount: agg?.tripCount ?? 0,
    longestStreak: streaks.longest,
    maxTripDistanceKm: agg?.maxTripDistanceKm ?? 0,
    maxTripDurationSec: agg?.maxTripDurationSec ?? 0,
    maxTripSpeedKmh: agg?.maxTripSpeedKmh ?? 0,
    maxDayDistanceKm: derived.maxDayDistanceKm,
    monthsActive: derived.monthsActive,
    earlyTripCount: agg?.earlyTripCount ?? 0,
    nightTripCount: agg?.nightTripCount ?? 0,
    weekendTripCount: agg?.weekendTripCount ?? 0,
    distinctWeekdayCount: agg?.distinctWeekdayCount ?? 0,
    weeklyGoalsMet: derived.weeklyGoalsMet,
    monthlyGoalsMet: derived.monthlyGoalsMet,
  };
}

/**
 * Evaluate all badge thresholds for a user and insert any newly unlocked badges.
 * Uses ON CONFLICT DO NOTHING to gracefully handle races / duplicates.
 *
 * @returns Array of BadgeIds that were newly unlocked in this call.
 */
export async function evaluateAndUnlockBadges(userId: string): Promise<BadgeId[]> {
  // 1. Aggregate lifetime stats
  const userStats = await collectUserStats(userId);

  // 2. Get already-unlocked badge IDs
  const existing = await db
    .select({ badgeId: achievements.badgeId })
    .from(achievements)
    .where(eq(achievements.userId, userId));

  const unlockedSet = new Set(existing.map((r) => r.badgeId));

  // 3. Determine which badges are newly earned
  const newlyUnlocked: BadgeId[] = [];

  for (const [badgeId, check] of Object.entries(BADGE_THRESHOLDS) as [
    BadgeId,
    (s: UserStats) => boolean,
  ][]) {
    if (!unlockedSet.has(badgeId) && check(userStats)) {
      newlyUnlocked.push(badgeId);
    }
  }

  // 4. Bulk insert with ON CONFLICT DO NOTHING
  if (newlyUnlocked.length > 0) {
    await db
      .insert(achievements)
      .values(newlyUnlocked.map((badgeId) => ({ userId, badgeId })))
      .onConflictDoNothing({ target: [achievements.userId, achievements.badgeId] });
  }

  return newlyUnlocked;
}

/**
 * Re-evaluate all unlocked badges for a user and revoke any whose thresholds
 * are no longer met. This should be called after trip deletion.
 *
 * @returns Array of BadgeIds that were revoked.
 */
export async function reevaluateBadges(userId: string): Promise<BadgeId[]> {
  // 1. Aggregate lifetime stats (same collector as evaluateAndUnlockBadges)
  const userStats = await collectUserStats(userId);

  // 2. Get all currently unlocked badges
  const existing = await db
    .select({ badgeId: achievements.badgeId })
    .from(achievements)
    .where(eq(achievements.userId, userId));

  // 3. Check each unlocked badge against thresholds — collect those no longer met
  const revoked: BadgeId[] = [];

  for (const row of existing) {
    const badgeId = row.badgeId as BadgeId;
    const check = BADGE_THRESHOLDS[badgeId];
    if (check && !check(userStats)) {
      revoked.push(badgeId);
    }
  }

  // 4. Delete revoked achievements
  if (revoked.length > 0) {
    await db
      .delete(achievements)
      .where(and(eq(achievements.userId, userId), inArray(achievements.badgeId, revoked)));
  }

  return revoked;
}
