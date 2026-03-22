import { eq, sql, sum, desc } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { trips } from "../db/schema";
import { sendPushToUser } from "./push";

/**
 * After a trip is created, check if the user overtook anyone on the all-time
 * CO2 leaderboard and send push notifications to both parties.
 *
 * "Overtaken" = any opted-in user whose total CO2 is now strictly less than
 * the current user's total, but was >= before this trip (i.e. their total
 * falls within [userTotal - tripCo2, userTotal)).
 */
export async function checkLeaderboardChanges(
  userId: string,
  tripCo2SavedKg: number,
): Promise<void> {
  try {
    // 1. Get full all-time leaderboard (only opted-in users)
    const entries = await db
      .select({
        userId: user.id,
        name: user.name,
        totalCo2SavedKg: sql<number>`coalesce(${sum(trips.co2SavedKg)}, 0)`.mapWith(Number),
      })
      .from(user)
      .leftJoin(trips, eq(user.id, trips.userId))
      .where(eq(user.leaderboardOptOut, false))
      .groupBy(user.id, user.name)
      .orderBy(desc(sql`coalesce(${sum(trips.co2SavedKg)}, 0)`));

    // 2. Find the current user in the results
    const currentEntry = entries.find((e) => e.userId === userId);
    if (!currentEntry) return; // user opted out or not found

    const currentTotal = currentEntry.totalCo2SavedKg;
    const previousTotal = currentTotal - tripCo2SavedKg;

    // 3. Find users who were just overtaken:
    //    Their total is in [previousTotal, currentTotal) — they were ahead or tied
    //    before, but are now behind.
    const overtaken = entries.filter(
      (e) =>
        e.userId !== userId &&
        e.totalCo2SavedKg >= previousTotal &&
        e.totalCo2SavedKg < currentTotal,
    );

    if (overtaken.length === 0) return;

    // 4. Send notifications (fire-and-forget, errors caught per-send)
    for (const other of overtaken) {
      // Notify the overtaken user
      sendPushToUser(other.userId, {
        title: "ecoRide",
        body: `${currentEntry.name} vient de vous dépasser au classement ! 🏆`,
      }).catch(() => {});

      // Notify the current user
      sendPushToUser(userId, {
        title: "ecoRide",
        body: `Vous venez de dépasser ${other.name} au classement ! 💪`,
      }).catch(() => {});
    }
  } catch (err) {
    // Never let leaderboard notification errors propagate
    console.error("[leaderboard-notifications] Error:", err);
  }
}
