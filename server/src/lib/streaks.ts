import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";

/**
 * Format a Date as YYYY-MM-DD in the given IANA timezone.
 * Falls back to UTC if the timezone is not provided.
 */
function dateToLocalDay(date: Date, tz?: string): string {
  return date.toLocaleDateString("sv-SE", { timeZone: tz ?? "UTC" });
}

/**
 * Get "today" as YYYY-MM-DD in the given IANA timezone.
 */
function todayInTz(tz?: string): string {
  return dateToLocalDay(new Date(), tz);
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
  // Get distinct trip dates ordered descending
  const rows = await db
    .selectDistinctOn([trips.startedAt], {
      date: trips.startedAt,
    })
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(desc(trips.startedAt));

  if (rows.length === 0) return { current: 0, longest: 0 };

  // Extract unique dates (YYYY-MM-DD) in the user's local timezone
  const dateSet = new Set<string>();
  for (const row of rows) {
    dateSet.add(dateToLocalDay(row.date, tz));
  }
  const dates = Array.from(dateSet).sort().reverse();

  const today = todayInTz(tz);

  let current = 0;
  let longest = 0;
  let streak = 0;

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]!;
    if (i === 0) {
      // Streak counts only if the most recent trip was today or yesterday
      const diffDays = Math.floor((new Date(today).getTime() - new Date(d).getTime()) / 86400000);
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
