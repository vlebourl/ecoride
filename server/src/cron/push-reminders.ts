import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { trips } from "../db/schema";
import { pushSubscriptions } from "../db/schema/push-subscriptions";
import { sendPushNotification, type PushPayload } from "../lib/push";
import type { WeekDay } from "@ecoride/shared/types";

const DAY_MAP: Record<number, WeekDay> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

const REMINDER_PAYLOAD: PushPayload = {
  title: "ecoRide",
  body: "Tu n'as pas encore enregistré de trajet aujourd'hui 🚴",
  icon: "/icons/icon-192.png",
  url: "/",
};

/**
 * Check which users should receive a push reminder right now,
 * then send the notifications.
 */
export async function processReminders(): Promise<void> {
  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayWeekDay = DAY_MAP[now.getDay()]!;
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Find users with reminders enabled, matching time and day,
  // who have NOT logged a trip today
  const eligibleUsers = await db
    .select({ userId: user.id })
    .from(user)
    .where(
      and(
        eq(user.reminderEnabled, true),
        eq(user.reminderTime, currentHHMM),
        sql`${todayWeekDay} = ANY(${user.reminderDays})`,
      ),
    );

  if (eligibleUsers.length === 0) return;

  // Filter out users who already have a trip today
  for (const { userId } of eligibleUsers) {
    const [hasTrip] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.userId, userId), gte(trips.startedAt, todayMidnight)))
      .limit(1);

    if (hasTrip) continue;

    // Get push subscriptions for this user
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    for (const sub of subs) {
      await sendPushNotification(sub, REMINDER_PAYLOAD);
    }
  }
}
