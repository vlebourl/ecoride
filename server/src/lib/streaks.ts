import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compute the current streak (consecutive UTC calendar days with at least one trip)
 * and the longest streak ever recorded for a user.
 *
 * Backend calculations stay UTC-only. User timezone is a presentation concern
 * handled in the frontend from the saved profile setting.
 *
 * @param userId - The user to compute streaks for
 */
export async function computeStreak(userId: string): Promise<{ current: number; longest: number }> {
  // Get distinct UTC trip dates ordered descending via GROUP BY DATE
  const rows = await db
    .select({ day: sql<string>`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`.as("day") })
    .from(trips)
    .where(eq(trips.userId, userId))
    .groupBy(sql`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`)
    .orderBy(desc(sql`day`));

  if (rows.length === 0) return { current: 0, longest: 0 };

  const dates = rows.map((r) => r.day);
  const today = todayUtc();

  let current = 0;
  let longest = 0;
  let streak = 0;
  let currentStreakEnded = false;

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]!;
    if (i === 0) {
      // Streak counts only if the most recent trip was today or yesterday
      const diffDays = Math.floor((new Date(today).getTime() - new Date(d).getTime()) / 86400000);
      if (diffDays > 1) {
        current = 0;
        streak = 1;
        currentStreakEnded = true;
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
        if (!currentStreakEnded) current = streak;
      } else {
        longest = Math.max(longest, streak);
        streak = 1;
        if (!currentStreakEnded) currentStreakEnded = true;
      }
    }
  }

  longest = Math.max(longest, streak);
  return { current, longest };
}
