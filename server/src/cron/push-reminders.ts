import { eq, and, gte, sql, inArray } from "drizzle-orm";
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

  // Find users with reminders enabled, matching time and day
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

  const userIds = eligibleUsers.map((u) => u.userId);

  // Batch: find which of these users already have a trip today (1 query instead of N)
  const usersWithTrips = await db
    .selectDistinct({ userId: trips.userId })
    .from(trips)
    .where(and(inArray(trips.userId, userIds), gte(trips.startedAt, todayMidnight)));

  const usersWithTripsSet = new Set(usersWithTrips.map((u) => u.userId));
  const usersToNotify = userIds.filter((id) => !usersWithTripsSet.has(id));

  if (usersToNotify.length === 0) return;

  // Batch: fetch all push subscriptions for eligible users (1 query instead of N)
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, usersToNotify));

  for (const sub of subs) {
    await sendPushNotification(sub, REMINDER_PAYLOAD);
  }
}
