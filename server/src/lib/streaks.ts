import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";

/**
 * Get "today" as YYYY-MM-DD in the given IANA timezone.
 */
function todayInTz(tz?: string): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: tz ?? "UTC" });
}

/**
 * Compute the current streak (consecutive days with at least one trip)
 * and the longest streak ever recorded for a user.
 *
 * @param userId - The user to compute streaks for
 * @param tz - Optional IANA timezone (e.g. "Europe/Paris") used to determine
 *   "today" and to bucket trip timestamps into local calendar days.
 *   Falls back to UTC when omitted (backward compatible).
 */
export async function computeStreak(
  userId: string,
  tz?: string,
): Promise<{ current: number; longest: number }> {
  // Get distinct trip dates ordered descending via GROUP BY DATE
  const rows = await db
    .select({ day: sql<string>`DATE(${trips.startedAt} AT TIME ZONE ${tz ?? "UTC"})`.as("day") })
    .from(trips)
    .where(eq(trips.userId, userId))
    .groupBy(sql`DATE(${trips.startedAt} AT TIME ZONE ${tz ?? "UTC"})`)
    .orderBy(desc(sql`day`));

  if (rows.length === 0) return { current: 0, longest: 0 };

  const dates = rows.map((r) => r.day);

  const today = todayInTz(tz);

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
        if (!currentStreakEnded) {
          currentStreakEnded = true;
        }
      }
    }
  }
  longest = Math.max(longest, streak);

  return { current, longest };
}
