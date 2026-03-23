import { describe, expect, it } from "vitest";
import { computeStreak } from "../streaks";

describe("computeStreak", () => {
  it("returns 0 for empty trips", () => {
    const info = computeStreak([], "2026-03-21");
    expect(info.currentStreak).toBe(0);
    expect(info.longestStreak).toBe(0);
    expect(info.lastTripDate).toBeNull();
    expect(info.isActiveToday).toBe(false);
  });
  it("returns streak 1 for single trip today", () => {
    const info = computeStreak(["2026-03-21"], "2026-03-21");
    expect(info.currentStreak).toBe(1);
    expect(info.isActiveToday).toBe(true);
  });
  it("counts 7 consecutive days ending today", () => {
    const dates = [
      "2026-03-15",
      "2026-03-16",
      "2026-03-17",
      "2026-03-18",
      "2026-03-19",
      "2026-03-20",
      "2026-03-21",
    ];
    expect(computeStreak(dates, "2026-03-21").currentStreak).toBe(7);
  });
  it("keeps streak alive if last trip was yesterday", () => {
    const info = computeStreak(["2026-03-18", "2026-03-19", "2026-03-20"], "2026-03-21");
    expect(info.currentStreak).toBe(3);
    expect(info.isActiveToday).toBe(false);
  });
  it("resets streak after a gap", () => {
    expect(
      computeStreak(["2026-03-17", "2026-03-18", "2026-03-20", "2026-03-21"], "2026-03-21")
        .currentStreak,
    ).toBe(2);
  });
  it("deduplicates multiple trips on same day", () => {
    expect(
      computeStreak(["2026-03-21", "2026-03-21", "2026-03-21"], "2026-03-21").currentStreak,
    ).toBe(1);
  });
  it("streak is broken if last trip was 2+ days ago", () => {
    expect(
      computeStreak(["2026-03-15", "2026-03-16", "2026-03-17"], "2026-03-21").currentStreak,
    ).toBe(0);
  });
  it("tracks longest streak separately", () => {
    const dates = [
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-20",
      "2026-03-21",
    ];
    const info = computeStreak(dates, "2026-03-21");
    expect(info.currentStreak).toBe(2);
    expect(info.longestStreak).toBe(5);
  });
  it("handles unsorted input", () => {
    expect(
      computeStreak(["2026-03-21", "2026-03-19", "2026-03-20"], "2026-03-21").currentStreak,
    ).toBe(3);
  });
});
