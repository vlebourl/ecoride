import { eq, and, sum, count, inArray } from "drizzle-orm";
import { db } from "../db";
import { trips, achievements } from "../db/schema";
import { computeStreak } from "./streaks";
import type { BadgeId } from "@ecoride/shared/types";

/**
 * Badge threshold definitions.
 * Each entry maps a BadgeId to a predicate over the user's aggregate stats.
 */
interface UserStats {
  totalDistanceKm: number;
  totalCo2SavedKg: number;
  tripCount: number;
  currentStreak: number;
}

const BADGE_THRESHOLDS: Record<BadgeId, (s: UserStats) => boolean> = {
  first_trip:  (s) => s.tripCount >= 1,
  trips_10:    (s) => s.tripCount >= 10,
  trips_50:    (s) => s.tripCount >= 50,
  trips_100:   (s) => s.tripCount >= 100,
  km_100:      (s) => s.totalDistanceKm >= 100,
  km_500:      (s) => s.totalDistanceKm >= 500,
  km_1000:     (s) => s.totalDistanceKm >= 1000,
  co2_10kg:    (s) => s.totalCo2SavedKg >= 10,
  co2_100kg:   (s) => s.totalCo2SavedKg >= 100,
  co2_1t:      (s) => s.totalCo2SavedKg >= 1000,
  streak_7:    (s) => s.currentStreak >= 7,
  streak_30:   (s) => s.currentStreak >= 30,
};

/**
 * Evaluate all badge thresholds for a user and insert any newly unlocked badges.
 * Uses ON CONFLICT DO NOTHING to gracefully handle races / duplicates.
 *
 * @returns Array of BadgeIds that were newly unlocked in this call.
 */
export async function evaluateAndUnlockBadges(userId: string): Promise<BadgeId[]> {
  // 1. Aggregate lifetime stats
  const [stats] = await db
    .select({
      totalDistanceKm: sum(trips.distanceKm).mapWith(Number),
      totalCo2SavedKg: sum(trips.co2SavedKg).mapWith(Number),
      tripCount: count(),
    })
    .from(trips)
    .where(eq(trips.userId, userId));

  const streaks = await computeStreak(userId);

  const userStats: UserStats = {
    totalDistanceKm: stats?.totalDistanceKm ?? 0,
    totalCo2SavedKg: stats?.totalCo2SavedKg ?? 0,
    tripCount: stats?.tripCount ?? 0,
    currentStreak: streaks.current,
  };

  // 2. Get already-unlocked badge IDs
  const existing = await db
    .select({ badgeId: achievements.badgeId })
    .from(achievements)
    .where(eq(achievements.userId, userId));

  const unlockedSet = new Set(existing.map((r) => r.badgeId));

  // 3. Determine which badges are newly earned
  const newlyUnlocked: BadgeId[] = [];

  for (const [badgeId, check] of Object.entries(BADGE_THRESHOLDS) as [BadgeId, (s: UserStats) => boolean][]) {
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
  // 1. Aggregate lifetime stats (same query as evaluateAndUnlockBadges)
  const [stats] = await db
    .select({
      totalDistanceKm: sum(trips.distanceKm).mapWith(Number),
      totalCo2SavedKg: sum(trips.co2SavedKg).mapWith(Number),
      tripCount: count(),
    })
    .from(trips)
    .where(eq(trips.userId, userId));

  const streaks = await computeStreak(userId);

  const userStats: UserStats = {
    totalDistanceKm: stats?.totalDistanceKm ?? 0,
    totalCo2SavedKg: stats?.totalCo2SavedKg ?? 0,
    tripCount: stats?.tripCount ?? 0,
    currentStreak: streaks.current,
  };

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
      .where(
        and(
          eq(achievements.userId, userId),
          inArray(achievements.badgeId, revoked),
        ),
      );
  }

  return revoked;
}
