import { eq, and, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { trips } from "../db/schema";
import { pushSubscriptions } from "../db/schema/push-subscriptions";
import { sendPushNotification, type PushPayload } from "../lib/push";
import { normalizeTimezone } from "../lib/timezone";
import type { WeekDay } from "@ecoride/shared/types";

const WEEKDAY_MAP: Record<string, WeekDay> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

interface LocalReminderSchedule {
  time: string;
  weekday: WeekDay;
  date: string;
}

function getLocalDateParts(now: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimezone(timezone),
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
}

export function getLocalReminderSchedule(
  now: Date,
  timezone: string | null,
): LocalReminderSchedule {
  const parts = getLocalDateParts(now, normalizeTimezone(timezone));

  return {
    time: `${parts.hour}:${parts.minute}`,
    weekday: WEEKDAY_MAP[parts.weekday!]!,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function isTripOnLocalDate(
  tripStartedAt: Date,
  date: string,
  timezone: string | null,
): boolean {
  const parts = getLocalDateParts(tripStartedAt, normalizeTimezone(timezone));
  return `${parts.year}-${parts.month}-${parts.day}` === date;
}

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

  // Reminder time and weekdays are user preferences, so compare them against
  // each user's local clock rather than the server's timezone.
  const eligibleUsers = await db
    .select({
      userId: user.id,
      timezone: user.timezone,
      reminderTime: user.reminderTime,
      reminderDays: user.reminderDays,
    })
    .from(user)
    .where(eq(user.reminderEnabled, true));

  const scheduledUsers = eligibleUsers.filter((candidate) => {
    const schedule = getLocalReminderSchedule(now, candidate.timezone);
    return (
      candidate.reminderTime === schedule.time &&
      (candidate.reminderDays?.includes(schedule.weekday) ?? false)
    );
  });

  if (scheduledUsers.length === 0) return;

  const userIds = scheduledUsers.map((u) => u.userId);
  const localSchedules = new Map(
    scheduledUsers.map((candidate) => [
      candidate.userId,
      getLocalReminderSchedule(now, candidate.timezone),
    ]),
  );
  const timezones = new Map(
    scheduledUsers.map((candidate) => [candidate.userId, normalizeTimezone(candidate.timezone)]),
  );

  // Every possible local "today" begins within the prior 27 hours (including
  // DST fall-back). Fetch once, then compare calendar dates in each timezone.
  const usersWithTrips = await db
    .select({ userId: trips.userId, startedAt: trips.startedAt })
    .from(trips)
    .where(
      and(
        inArray(trips.userId, userIds),
        gte(trips.startedAt, new Date(now.getTime() - 27 * 60 * 60 * 1000)),
      ),
    );

  const usersWithTripsSet = new Set(
    usersWithTrips
      .filter((trip) => {
        const schedule = localSchedules.get(trip.userId);
        const timezone = timezones.get(trip.userId);
        return (
          schedule !== undefined &&
          timezone !== undefined &&
          isTripOnLocalDate(trip.startedAt, schedule.date, timezone)
        );
      })
      .map((trip) => trip.userId),
  );
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
