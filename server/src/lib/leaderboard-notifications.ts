import { eq, sql, sum, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { trips } from "../db/schema";
import { pushSubscriptions } from "../db/schema/push-subscriptions";
import { reportBackgroundError } from "./background";
import { sendPushNotification, type PushPayload } from "./push";
import { logger } from "./logger";

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

    // 3. Find users who were just overtaken
    const overtaken = entries.filter(
      (e) =>
        e.userId !== userId &&
        e.totalCo2SavedKg >= previousTotal &&
        e.totalCo2SavedKg < currentTotal,
    );

    if (overtaken.length === 0) return;

    // 4. Batch fetch all subscriptions for involved users (1 query instead of 2N)
    const allRecipientIds = [userId, ...overtaken.map((o) => o.userId)];
    const allSubs = await db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, allRecipientIds));

    // Group subscriptions by userId
    const subsByUser = new Map<string, typeof allSubs>();
    for (const sub of allSubs) {
      const existing = subsByUser.get(sub.userId) ?? [];
      existing.push(sub);
      subsByUser.set(sub.userId, existing);
    }

    // 5. Send notifications using pre-fetched subscriptions
    for (const other of overtaken) {
      const overtakenPayload: PushPayload = {
        title: "ecoRide",
        body: `${currentEntry.name} vient de vous dépasser au classement ! 🏆`,
      };
      const currentPayload: PushPayload = {
        title: "ecoRide",
        body: `Vous venez de dépasser ${other.name} au classement ! 💪`,
      };

      // Notify the overtaken user
      for (const sub of subsByUser.get(other.userId) ?? []) {
        reportBackgroundError(
          sendPushNotification(sub, overtakenPayload, {
            userId: other.userId,
            source: "user",
          }),
          logger,
          "leaderboard_notify_overtaken_failed",
          { userId, overtakenUserId: other.userId },
        );
      }

      // Notify the current user
      for (const sub of subsByUser.get(userId) ?? []) {
        reportBackgroundError(
          sendPushNotification(sub, currentPayload, { userId, source: "user" }),
          logger,
          "leaderboard_notify_current_user_failed",
          { userId, overtakenUserId: other.userId },
        );
      }
    }
  } catch (err) {
    // Never let leaderboard notification errors propagate
    logger.error("leaderboard_notification_failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
