import { describe, expect, it } from "vitest";
import { evaluateBadges } from "../badges";

const zero = { totalTrips: 0, totalKm: 0, totalCo2Kg: 0, totalMoneySaved: 0, currentStreak: 0 };

describe("evaluateBadges", () => {
  it("all badges locked at zero stats", () => {
    const badges = evaluateBadges(zero);
    expect(badges.every((b) => !b.unlocked)).toBe(true);
    expect(badges.every((b) => b.progressRatio === 0)).toBe(true);
  });
  it("unlocks first trip badge at 1 trip", () => {
    const badges = evaluateBadges({ ...zero, totalTrips: 1 });
    const first = badges.find((b) => b.id === "first_trip");
    expect(first?.unlocked).toBe(true);
    expect(first?.progressRatio).toBe(1);
  });
  it("shows progress toward 10 trips at 5 trips", () => {
    const b = evaluateBadges({ ...zero, totalTrips: 5 }).find((b) => b.id === "trips_10");
    expect(b?.unlocked).toBe(false);
    expect(b?.progressRatio).toBeCloseTo(0.5);
  });
  it("unlocks badge at exact threshold", () => {
    const badges = evaluateBadges({
      ...zero,
      totalTrips: 10,
      totalKm: 100,
      totalCo2Kg: 10,
      currentStreak: 7,
    });
    expect(badges.find((b) => b.id === "trips_10")?.unlocked).toBe(true);
    expect(badges.find((b) => b.id === "km_100")?.unlocked).toBe(true);
    expect(badges.find((b) => b.id === "co2_10kg")?.unlocked).toBe(true);
    expect(badges.find((b) => b.id === "streak_7")?.unlocked).toBe(true);
  });
  it("caps progress_ratio at 1", () => {
    const b = evaluateBadges({ ...zero, totalTrips: 200 }).find((b) => b.id === "trips_100");
    expect(b?.progressRatio).toBe(1);
  });
  it("unlocks money_100 badge at 100 EUR saved", () => {
    const badges = evaluateBadges({ ...zero, totalMoneySaved: 100 });
    const b = badges.find((b) => b.id === "money_100");
    expect(b?.unlocked).toBe(true);
    expect(b?.progressRatio).toBe(1);
  });
  it("shows progress toward money_100 at 50 EUR", () => {
    const b = evaluateBadges({ ...zero, totalMoneySaved: 50 }).find((b) => b.id === "money_100");
    expect(b?.unlocked).toBe(false);
    expect(b?.progressRatio).toBeCloseTo(0.5);
  });
  it("returns all 13 badge definitions", () => {
    expect(evaluateBadges(zero)).toHaveLength(13);
  });
});
