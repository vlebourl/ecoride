import { describe, it, expect, vi } from "vitest";

// Mock db to prevent real Postgres connection on module load
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../db/schema", () => ({ trips: {}, achievements: {} }));
vi.mock("../streaks", () => ({ computeStreak: vi.fn() }));

import { BADGE_THRESHOLDS, type UserStats } from "../badges";

function makeStats(overrides: Partial<UserStats> = {}): UserStats {
  return {
    totalDistanceKm: 0,
    totalCo2SavedKg: 0,
    totalMoneySavedEur: 0,
    tripCount: 0,
    currentStreak: 0,
    ...overrides,
  };
}

describe("BADGE_THRESHOLDS", () => {
  describe("first_trip", () => {
    it("unlocks when tripCount >= 1", () => {
      expect(BADGE_THRESHOLDS.first_trip(makeStats({ tripCount: 1 }))).toBe(true);
    });

    it("does not unlock when tripCount = 0", () => {
      expect(BADGE_THRESHOLDS.first_trip(makeStats({ tripCount: 0 }))).toBe(false);
    });
  });

  describe("trips_10", () => {
    it("unlocks at exactly 10 trips", () => {
      expect(BADGE_THRESHOLDS.trips_10(makeStats({ tripCount: 10 }))).toBe(true);
    });

    it("does not unlock at 9 trips", () => {
      expect(BADGE_THRESHOLDS.trips_10(makeStats({ tripCount: 9 }))).toBe(false);
    });
  });

  describe("trips_50", () => {
    it("unlocks at exactly 50 trips", () => {
      expect(BADGE_THRESHOLDS.trips_50(makeStats({ tripCount: 50 }))).toBe(true);
    });

    it("does not unlock at 49 trips", () => {
      expect(BADGE_THRESHOLDS.trips_50(makeStats({ tripCount: 49 }))).toBe(false);
    });
  });

  describe("trips_100", () => {
    it("unlocks at exactly 100 trips", () => {
      expect(BADGE_THRESHOLDS.trips_100(makeStats({ tripCount: 100 }))).toBe(true);
    });

    it("does not unlock at 99 trips", () => {
      expect(BADGE_THRESHOLDS.trips_100(makeStats({ tripCount: 99 }))).toBe(false);
    });
  });

  describe("km_100", () => {
    it("unlocks at exactly 100 km", () => {
      expect(BADGE_THRESHOLDS.km_100(makeStats({ totalDistanceKm: 100 }))).toBe(true);
    });

    it("does not unlock at 99.9 km", () => {
      expect(BADGE_THRESHOLDS.km_100(makeStats({ totalDistanceKm: 99.9 }))).toBe(false);
    });

    it("unlocks above threshold", () => {
      expect(BADGE_THRESHOLDS.km_100(makeStats({ totalDistanceKm: 200 }))).toBe(true);
    });
  });

  describe("km_500", () => {
    it("unlocks at exactly 500 km", () => {
      expect(BADGE_THRESHOLDS.km_500(makeStats({ totalDistanceKm: 500 }))).toBe(true);
    });

    it("does not unlock at 499 km", () => {
      expect(BADGE_THRESHOLDS.km_500(makeStats({ totalDistanceKm: 499 }))).toBe(false);
    });
  });

  describe("km_1000", () => {
    it("unlocks at exactly 1000 km", () => {
      expect(BADGE_THRESHOLDS.km_1000(makeStats({ totalDistanceKm: 1000 }))).toBe(true);
    });

    it("does not unlock at 999 km", () => {
      expect(BADGE_THRESHOLDS.km_1000(makeStats({ totalDistanceKm: 999 }))).toBe(false);
    });
  });

  describe("co2_10kg", () => {
    it("unlocks at exactly 10 kg CO2", () => {
      expect(BADGE_THRESHOLDS.co2_10kg(makeStats({ totalCo2SavedKg: 10 }))).toBe(true);
    });

    it("does not unlock at 9.99 kg CO2", () => {
      expect(BADGE_THRESHOLDS.co2_10kg(makeStats({ totalCo2SavedKg: 9.99 }))).toBe(false);
    });
  });

  describe("co2_100kg", () => {
    it("unlocks at exactly 100 kg CO2", () => {
      expect(BADGE_THRESHOLDS.co2_100kg(makeStats({ totalCo2SavedKg: 100 }))).toBe(true);
    });

    it("does not unlock at 99 kg CO2", () => {
      expect(BADGE_THRESHOLDS.co2_100kg(makeStats({ totalCo2SavedKg: 99 }))).toBe(false);
    });
  });

  describe("co2_1t", () => {
    it("unlocks at exactly 1000 kg (1 tonne) CO2", () => {
      expect(BADGE_THRESHOLDS.co2_1t(makeStats({ totalCo2SavedKg: 1000 }))).toBe(true);
    });

    it("does not unlock at 999 kg CO2", () => {
      expect(BADGE_THRESHOLDS.co2_1t(makeStats({ totalCo2SavedKg: 999 }))).toBe(false);
    });
  });

  describe("streak_7", () => {
    it("unlocks at exactly 7-day streak", () => {
      expect(BADGE_THRESHOLDS.streak_7(makeStats({ currentStreak: 7 }))).toBe(true);
    });

    it("does not unlock at 6-day streak", () => {
      expect(BADGE_THRESHOLDS.streak_7(makeStats({ currentStreak: 6 }))).toBe(false);
    });

    it("unlocks above threshold", () => {
      expect(BADGE_THRESHOLDS.streak_7(makeStats({ currentStreak: 14 }))).toBe(true);
    });
  });

  describe("streak_30", () => {
    it("unlocks at exactly 30-day streak", () => {
      expect(BADGE_THRESHOLDS.streak_30(makeStats({ currentStreak: 30 }))).toBe(true);
    });

    it("does not unlock at 29-day streak", () => {
      expect(BADGE_THRESHOLDS.streak_30(makeStats({ currentStreak: 29 }))).toBe(false);
    });
  });

  describe("money_100", () => {
    it("unlocks at exactly 100 EUR saved", () => {
      expect(BADGE_THRESHOLDS.money_100(makeStats({ totalMoneySavedEur: 100 }))).toBe(true);
    });

    it("does not unlock at 99.99 EUR", () => {
      expect(BADGE_THRESHOLDS.money_100(makeStats({ totalMoneySavedEur: 99.99 }))).toBe(false);
    });

    it("unlocks above threshold", () => {
      expect(BADGE_THRESHOLDS.money_100(makeStats({ totalMoneySavedEur: 250 }))).toBe(true);
    });
  });

  describe("independence from other stats", () => {
    it("km badge ignores trip count and streak", () => {
      const stats = makeStats({
        totalDistanceKm: 100,
        tripCount: 0,
        currentStreak: 0,
      });
      expect(BADGE_THRESHOLDS.km_100(stats)).toBe(true);
      expect(BADGE_THRESHOLDS.first_trip(stats)).toBe(false);
    });

    it("streak badge ignores distance and co2", () => {
      const stats = makeStats({
        currentStreak: 7,
        totalDistanceKm: 0,
        totalCo2SavedKg: 0,
      });
      expect(BADGE_THRESHOLDS.streak_7(stats)).toBe(true);
      expect(BADGE_THRESHOLDS.km_100(stats)).toBe(false);
    });
  });
});
