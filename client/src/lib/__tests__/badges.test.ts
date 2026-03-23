import { describe, expect, it } from "vitest";
import { evaluateBadges } from "../badges";

describe("evaluateBadges", () => {
  it("all badges locked at zero stats", () => {
    const badges = evaluateBadges({ totalTrips: 0, totalKm: 0, totalCo2Kg: 0, currentStreak: 0 });
    expect(badges.every((b) => !b.unlocked)).toBe(true);
    expect(badges.every((b) => b.progressRatio === 0)).toBe(true);
  });
  it("unlocks first trip badge at 1 trip", () => {
    const badges = evaluateBadges({ totalTrips: 1, totalKm: 0, totalCo2Kg: 0, currentStreak: 0 });
    const first = badges.find((b) => b.id === "first_trip");
    expect(first?.unlocked).toBe(true);
    expect(first?.progressRatio).toBe(1);
  });
  it("shows progress toward 10 trips at 5 trips", () => {
    const b = evaluateBadges({ totalTrips: 5, totalKm: 0, totalCo2Kg: 0, currentStreak: 0 }).find(
      (b) => b.id === "trips_10",
    );
    expect(b?.unlocked).toBe(false);
    expect(b?.progressRatio).toBeCloseTo(0.5);
  });
  it("unlocks badge at exact threshold", () => {
    const badges = evaluateBadges({
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
    const b = evaluateBadges({ totalTrips: 200, totalKm: 0, totalCo2Kg: 0, currentStreak: 0 }).find(
      (b) => b.id === "trips_100",
    );
    expect(b?.progressRatio).toBe(1);
  });
  it("returns all 12 badge definitions", () => {
    expect(
      evaluateBadges({ totalTrips: 0, totalKm: 0, totalCo2Kg: 0, currentStreak: 0 }),
    ).toHaveLength(12);
  });
});
