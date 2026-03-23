import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";

// Mock db and schema to prevent real Postgres connection on module load
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../db/schema", () => ({ trips: {} }));
vi.mock("../../db/schema/auth", () => ({ user: {} }));
vi.mock("../../lib/validation", () => ({ validationHook: vi.fn() }));

import { computeStreakFromDates, computeAvgSpeedKmh } from "../../routes/leaderboard.routes";

/**
 * Helper: format a Date as YYYY-MM-DD (UTC) — matches the server's dateToDay().
 */
function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Build an array of consecutive YYYY-MM-DD strings ending on `endDate`,
 * going back `count` days.
 */
function consecutiveDays(count: number, endDate: Date): string[] {
  const dates: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(dateToDay(d));
  }
  return dates;
}

describe("computeStreakFromDates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for empty array", () => {
    expect(computeStreakFromDates([])).toBe(0);
  });

  it("returns 1 for single day that is today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    expect(computeStreakFromDates(["2025-06-15"])).toBe(1);
  });

  it("returns 1 for single day that is yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    expect(computeStreakFromDates(["2025-06-14"])).toBe(1);
  });

  it("returns 0 for a date more than 1 day in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    expect(computeStreakFromDates(["2025-06-13"])).toBe(0);
  });

  it("counts consecutive days correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    const dates = consecutiveDays(5, new Date("2025-06-15T00:00:00Z"));
    // 2025-06-11, 2025-06-12, 2025-06-13, 2025-06-14, 2025-06-15
    expect(computeStreakFromDates(dates)).toBe(5);
  });

  it("breaks streak on a gap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    const dates = [
      "2025-06-10", // gap on June 11
      "2025-06-12",
      "2025-06-13",
      "2025-06-14",
      "2025-06-15",
    ];
    expect(computeStreakFromDates(dates)).toBe(4);
  });

  it("deduplicates dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    const dates = [
      "2025-06-14",
      "2025-06-14", // duplicate
      "2025-06-15",
      "2025-06-15", // duplicate
    ];
    expect(computeStreakFromDates(dates)).toBe(2);
  });

  it("handles unsorted input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    const dates = ["2025-06-15", "2025-06-13", "2025-06-14"];
    expect(computeStreakFromDates(dates)).toBe(3);
  });

  it("returns 0 when all dates are old", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    const dates = ["2025-01-01", "2025-01-02", "2025-01-03"];
    expect(computeStreakFromDates(dates)).toBe(0);
  });
});

describe("computeAvgSpeedKmh", () => {
  it("returns 0 for zero duration", () => {
    expect(computeAvgSpeedKmh(10, 0)).toBe(0);
  });

  it("returns 0 for negative duration", () => {
    expect(computeAvgSpeedKmh(10, -1)).toBe(0);
  });

  it("calculates correct average speed", () => {
    // 10 km in 1800 sec (30 min) = 20 km/h
    expect(computeAvgSpeedKmh(10, 1800)).toBe(20);
  });

  it("rounds to 1 decimal place", () => {
    // 10 km in 2700 sec (45 min) = 13.333... km/h -> 13.3
    expect(computeAvgSpeedKmh(10, 2700)).toBe(13.3);
  });
});
