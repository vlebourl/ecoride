import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock("../db", () => ({ db: { select: mocks.select } }));
vi.mock("../db/schema/auth", () => ({
  user: { id: {}, timezone: {}, reminderTime: {}, reminderDays: {}, reminderEnabled: {} },
}));
vi.mock("../db/schema", () => ({ trips: { userId: {}, startedAt: {} } }));
vi.mock("../db/schema/push-subscriptions", () => ({ pushSubscriptions: { userId: {} } }));
vi.mock("../lib/push", () => ({ sendPushNotification: mocks.sendPushNotification }));

import { getLocalReminderSchedule, isTripOnLocalDate, processReminders } from "./push-reminders";

function selectResult(rows: unknown[]) {
  return { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(rows) };
}

describe("push reminder timezone helpers", () => {
  it("uses each user's local clock and weekday, even when they differ from the server", () => {
    const now = new Date("2026-01-15T00:30:00.000Z");

    expect(getLocalReminderSchedule(now, "America/Los_Angeles")).toEqual({
      time: "16:30",
      weekday: "wed",
      date: "2026-01-14",
    });
    expect(getLocalReminderSchedule(now, "Asia/Tokyo")).toEqual({
      time: "09:30",
      weekday: "thu",
      date: "2026-01-15",
    });
  });

  it("recognises a trip on the user's local date across a UTC midnight boundary", () => {
    const schedule = getLocalReminderSchedule(
      new Date("2026-01-15T00:30:00.000Z"),
      "America/Los_Angeles",
    );

    expect(
      isTripOnLocalDate(new Date("2026-01-14T23:30:00.000Z"), schedule.date, "America/Los_Angeles"),
    ).toBe(true);
    expect(
      isTripOnLocalDate(new Date("2026-01-15T08:30:00.000Z"), schedule.date, "America/Los_Angeles"),
    ).toBe(false);
  });
});

describe("processReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T00:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("notifies only a scheduled user without a trip on their local day", async () => {
    mocks.select
      .mockReturnValueOnce(
        selectResult([
          {
            userId: "los-angeles",
            timezone: "America/Los_Angeles",
            reminderTime: "16:30",
            reminderDays: ["wed"],
          },
          { userId: "tokyo", timezone: "Asia/Tokyo", reminderTime: "09:30", reminderDays: ["thu"] },
          {
            userId: "paris",
            timezone: "Europe/Paris",
            reminderTime: "01:30",
            reminderDays: ["thu"],
          },
        ]),
      )
      .mockReturnValueOnce(
        selectResult([
          { userId: "los-angeles", startedAt: new Date("2026-01-14T23:30:00.000Z") },
          { userId: "tokyo", startedAt: new Date("2026-01-14T16:00:00.000Z") },
        ]),
      )
      .mockReturnValueOnce(
        selectResult([{ userId: "paris", endpoint: "https://push.example.test/paris" }]),
      );
    mocks.sendPushNotification.mockResolvedValue(true);

    await processReminders();

    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "paris" }),
      expect.objectContaining({ title: "ecoRide" }),
    );
  });
});
