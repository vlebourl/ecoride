import { describe, it, expect, vi } from "vitest";

// Mock db to prevent real Postgres connection on module load
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../db/schema", () => ({ trips: {}, achievements: {} }));
vi.mock("../streaks", () => ({ computeStreak: vi.fn() }));

import type { BadgeId } from "@ecoride/shared/types";
import { BADGE_THRESHOLDS, type UserStats } from "../badges";

function makeStats(overrides: Partial<UserStats> = {}): UserStats {
  return {
    totalDistanceKm: 0,
    totalCo2SavedKg: 0,
    totalMoneySavedEur: 0,
    totalFuelSavedL: 0,
    tripCount: 0,
    longestStreak: 0,
    maxTripDistanceKm: 0,
    maxTripDurationSec: 0,
    maxTripSpeedKmh: 0,
    maxDayDistanceKm: 0,
    monthsActive: 0,
    earlyTripCount: 0,
    nightTripCount: 0,
    weekendTripCount: 0,
    distinctWeekdayCount: 0,
    weeklyGoalsMet: 0,
    monthlyGoalsMet: 0,
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
      expect(BADGE_THRESHOLDS.streak_7(makeStats({ longestStreak: 7 }))).toBe(true);
    });

    it("does not unlock at 6-day streak", () => {
      expect(BADGE_THRESHOLDS.streak_7(makeStats({ longestStreak: 6 }))).toBe(false);
    });

    it("unlocks above threshold", () => {
      expect(BADGE_THRESHOLDS.streak_7(makeStats({ longestStreak: 14 }))).toBe(true);
    });
  });

  describe("streak_30", () => {
    it("unlocks at exactly 30-day streak", () => {
      expect(BADGE_THRESHOLDS.streak_30(makeStats({ longestStreak: 30 }))).toBe(true);
    });

    it("does not unlock at 29-day streak", () => {
      expect(BADGE_THRESHOLDS.streak_30(makeStats({ longestStreak: 29 }))).toBe(false);
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
        longestStreak: 0,
      });
      expect(BADGE_THRESHOLDS.km_100(stats)).toBe(true);
      expect(BADGE_THRESHOLDS.first_trip(stats)).toBe(false);
    });

    it("streak badge ignores distance and co2", () => {
      const stats = makeStats({
        longestStreak: 7,
        totalDistanceKm: 0,
        totalCo2SavedKg: 0,
      });
      expect(BADGE_THRESHOLDS.streak_7(stats)).toBe(true);
      expect(BADGE_THRESHOLDS.km_100(stats)).toBe(false);
    });
  });
});

describe("nouveaux paliers cumulatifs", () => {
  const cases: [BadgeId, keyof UserStats, number][] = [
    ["trips_250", "tripCount", 250],
    ["trips_500", "tripCount", 500],
    ["km_2500", "totalDistanceKm", 2500],
    ["km_5000", "totalDistanceKm", 5000],
    ["km_10000", "totalDistanceKm", 10000],
    ["co2_250kg", "totalCo2SavedKg", 250],
    ["co2_500kg", "totalCo2SavedKg", 500],
    ["fuel_25l", "totalFuelSavedL", 25],
    ["fuel_50l", "totalFuelSavedL", 50],
    ["fuel_100l", "totalFuelSavedL", 100],
    ["fuel_250l", "totalFuelSavedL", 250],
    ["money_250", "totalMoneySavedEur", 250],
    ["money_500", "totalMoneySavedEur", 500],
    ["money_1000", "totalMoneySavedEur", 1000],
    ["streak_3", "longestStreak", 3],
    ["streak_14", "longestStreak", 14],
    ["streak_100", "longestStreak", 100],
    ["months_active_6", "monthsActive", 6],
    ["months_active_12", "monthsActive", 12],
    ["weekly_goal_10", "weeklyGoalsMet", 10],
    ["monthly_goal_3", "monthlyGoalsMet", 3],
    ["day_30", "maxDayDistanceKm", 30],
    ["day_50", "maxDayDistanceKm", 50],
    ["trip_25", "maxTripDistanceKm", 25],
    ["trip_50", "maxTripDistanceKm", 50],
    ["trip_2h", "maxTripDurationSec", 7200],
    ["early_bird", "earlyTripCount", 10],
    ["night_owl", "nightTripCount", 10],
    ["weekend_20", "weekendTripCount", 20],
    ["all_week", "distinctWeekdayCount", 7],
    ["speed_20", "maxTripSpeedKmh", 20],
    ["speed_22", "maxTripSpeedKmh", 22],
    ["speed_25", "maxTripSpeedKmh", 25],
  ];

  for (const [badgeId, field, threshold] of cases) {
    it(`${badgeId} se débloque au seuil exact et pas juste en dessous`, () => {
      expect(BADGE_THRESHOLDS[badgeId](makeStats({ [field]: threshold }))).toBe(true);
      expect(BADGE_THRESHOLDS[badgeId](makeStats({ [field]: threshold - 1 }))).toBe(false);
    });
  }
});

describe("badges streak indexés sur longestStreak", () => {
  it("garde streak_7 quand la série actuelle est cassée mais que le record tient", () => {
    expect(BADGE_THRESHOLDS.streak_7(makeStats({ longestStreak: 12 }))).toBe(true);
  });

  it("ne débloque pas streak_30 avec un record de 29", () => {
    expect(BADGE_THRESHOLDS.streak_30(makeStats({ longestStreak: 29 }))).toBe(false);
  });
});
