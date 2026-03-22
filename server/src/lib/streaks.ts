import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";

/**
 * Compute the current streak (consecutive days with at least one trip)
 * and the longest streak ever recorded for a user.
 */
export async function computeStreak(userId: string): Promise<{ current: number; longest: number }> {
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
