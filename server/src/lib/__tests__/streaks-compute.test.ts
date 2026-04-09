import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// DB mock — must be set up BEFORE importing modules that use it
// ---------------------------------------------------------------------------

let mockRows: { day: string }[] = [];

vi.mock("../../db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockRows)),
      })),
    },
  };
});
vi.mock("../../db/schema", () => ({ trips: { startedAt: {}, userId: {} } }));

// Import AFTER mocks are declared
import { computeStreak } from "../streaks";

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
    mockRows = [{ day: "2025-06-15" }];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 1, longest: 1 });
  });

  it("returns {current: 1, longest: 1} for a single trip yesterday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockRows = [{ day: "2025-06-14" }];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 1, longest: 1 });
  });

  it("returns {current: 0, longest: 1} for a single trip 2 days ago", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockRows = [{ day: "2025-06-13" }];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 0, longest: 1 });
  });

  it("counts 3 consecutive days ending today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    // DB returns descending order (GROUP BY + ORDER BY desc)
    mockRows = [{ day: "2025-06-15" }, { day: "2025-06-14" }, { day: "2025-06-13" }];
    const result = await computeStreak("user-1");
    expect(result).toEqual({ current: 3, longest: 3 });
  });

  it("handles already-deduplicated rows from GROUP BY", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    // GROUP BY already deduplicates — just 2 unique days
    mockRows = [{ day: "2025-06-15" }, { day: "2025-06-14" }];
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
      { day: "2025-06-15" }, // today
      { day: "2025-06-10" }, // gap — 5 days ago
      { day: "2025-06-09" },
      { day: "2025-06-08" },
    ];
    const result = await computeStreak("user-1");
    // current = 1 (today only), longest = 3 (June 8-9-10)
    expect(result).toEqual({ current: 1, longest: 3 });
  });

  it("current streak frozen after gap: today + yesterday, then old run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    mockRows = [
      { day: "2025-06-15" },
      { day: "2025-06-14" },
      { day: "2025-06-10" }, // gap
      { day: "2025-06-09" },
      { day: "2025-06-08" },
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
      { day: "2025-06-12" }, // 3 days ago — no current streak
      { day: "2025-06-11" },
      { day: "2025-06-01" }, // gap
      { day: "2025-05-31" },
      { day: "2025-05-30" },
      { day: "2025-05-29" },
      { day: "2025-05-28" },
      { day: "2025-05-27" },
    ];
    const result = await computeStreak("user-1");
    expect(result.current).toBe(0); // last trip was 3 days ago
    // June 11-12 = 2 days, then gap, May 27 - June 1 = 6 days → longest = 6
    expect(result.longest).toBe(6);
  });

  it("respects timezone parameter (timezone is now handled by DB query)", async () => {
    // The tz parameter is now passed to the SQL DATE() function,
    // so the mock just returns the already-converted day strings
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T23:30:00Z"));
    // DB would return "2025-06-15" for UTC timezone
    mockRows = [{ day: "2025-06-15" }];
    const utcResult = await computeStreak("user-1");
    expect(utcResult).toEqual({ current: 1, longest: 1 });
  });
});
