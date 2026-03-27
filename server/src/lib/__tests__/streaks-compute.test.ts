import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// DB mock — must be set up BEFORE importing modules that use it
// ---------------------------------------------------------------------------

let mockRows: { date: Date }[] = [];

vi.mock("../../db", () => {
  return {
    db: {
      selectDistinctOn: vi.fn(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockRows)),
      })),
    },
  };
});
vi.mock("../../db/schema", () => ({ trips: { startedAt: {}, userId: {} } }));

// Import AFTER mocks are declared
import { computeStreak } from "../streaks";

// ---------------------------------------------------------------------------
// Helper to build a Date at noon UTC for a given YYYY-MM-DD string
// ---------------------------------------------------------------------------
function d(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

describe("computeStreak", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockRows = [];
  });

  it("returns {current: 0, longest: 0} for a user with no trips", async () => {
    mockRows = [];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 0, longest: 0 });
  });

  it("returns {current: 1, longest: 1} for a single trip today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockRows = [{ date: d("2025-06-15") }];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 1, longest: 1 });
  });

  it("returns {current: 1, longest: 1} for a single trip yesterday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockRows = [{ date: d("2025-06-14") }];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 1, longest: 1 });
  });

  it("returns {current: 0, longest: 1} for a single trip 2 days ago", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockRows = [{ date: d("2025-06-13") }];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 0, longest: 1 });
  });

  it("counts 3 consecutive days ending today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    // DB returns descending order
    mockRows = [{ date: d("2025-06-15") }, { date: d("2025-06-14") }, { date: d("2025-06-13") }];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 3, longest: 3 });
  });

  it("deduplicates multiple trips on the same calendar day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockRows = [
      { date: new Date("2025-06-15T08:00:00Z") },
      { date: new Date("2025-06-15T18:00:00Z") }, // same day
      { date: d("2025-06-14") },
    ];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 2, longest: 2 });
  });

  // -------------------------------------------------------------------------
  // Regression: old consecutive runs must NOT inflate the current streak
  // -------------------------------------------------------------------------
  it("does not inflate current streak with old consecutive runs (regression)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    // Today only, then a gap, then 3 consecutive old days
    mockRows = [
      { date: d("2025-06-15") }, // today
      { date: d("2025-06-10") }, // gap — 5 days ago
      { date: d("2025-06-09") },
      { date: d("2025-06-08") },
    ];
    const result = await computeStreak("user-1");
    // current = 1 (today only), longest = 3 (June 8-9-10)
    expect(result).toEqual({ current: 1, longest: 3 });
  });

  it("current streak frozen after gap: today + yesterday, then old run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockRows = [
      { date: d("2025-06-15") },
      { date: d("2025-06-14") },
      { date: d("2025-06-10") }, // gap
      { date: d("2025-06-09") },
      { date: d("2025-06-08") },
    ];
    const result = await computeStreak("user-1");
    // current = 2 (today + yesterday), longest = 3 (June 8-9-10)
    expect(result).toEqual({ current: 2, longest: 3 });
  });

  it("longest streak from a past run is tracked correctly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    // Most recent trip was 3 days ago (broken streak), past run was 5 days
    mockRows = [
      { date: d("2025-06-12") }, // 3 days ago — no current streak
      { date: d("2025-06-11") }, // gap before this
      { date: d("2025-06-01") }, // gap
      { date: d("2025-05-31") },
      { date: d("2025-05-30") },
      { date: d("2025-05-29") },
      { date: d("2025-05-28") },
      { date: d("2025-05-27") },
    ];
    const result = await computeStreak("user-1");
    expect(result.current).toBe(0); // last trip was 3 days ago
    // June 11-12 = 2 days, then gap, May 27 - June 1 = 6 days → longest = 6
    expect(result.longest).toBe(6);
  });

  it("respects timezone parameter (Europe/Paris UTC+2)", async () => {
    // 2025-06-15T23:30:00Z = 2025-06-16T01:30:00+02 (Paris) => June 16 in Paris
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T23:30:00Z"));
    // Trip at 23:30 UTC = 01:30 Paris => June 16 locally
    mockRows = [{ date: new Date("2025-06-15T23:30:00Z") }];
    // Without tz: trip date is "2025-06-15" (UTC), today is "2025-06-15" → streak 1
    const utcResult = await computeStreak("user-1");
    expect(utcResult).toEqual({ current: 1, longest: 1 });
  });
});
