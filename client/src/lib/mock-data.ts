import type { User, Trip, Achievement, BadgeId } from "@ecoride/shared/types";
import type { StatsSummaryResponse, LeaderboardResponse } from "@ecoride/shared/api-contracts";

export const mockUser: User = {
  id: "user-1",
  email: "alex@example.com",
  name: "Alex Chen",
  image: null,
  vehicleModel: "Peugeot 308",
  fuelType: "sp95",
  consumptionL100: 6.5,
  mileage: 45000,
  leaderboardOptOut: false,
  reminderEnabled: true,
  reminderTime: "08:00",
  reminderDays: ["mon", "tue", "wed", "thu", "fri"],
  createdAt: "2026-01-15T10:00:00Z",
};

export const mockTrips: Trip[] = [
  {
    id: "trip-1",
    userId: "user-1",
    distanceKm: 12.4,
    durationSec: 2520,
    co2SavedKg: 1.86,
    moneySavedEur: 1.45,
    fuelSavedL: 0.81,
    fuelPriceEur: 1.79,
    startedAt: "2026-03-21T08:30:00Z",
    endedAt: "2026-03-21T09:12:00Z",
    gpsPoints: null,
  },
  {
    id: "trip-2",
    userId: "user-1",
    distanceKm: 8.2,
    durationSec: 1680,
    co2SavedKg: 1.23,
    moneySavedEur: 0.96,
    fuelSavedL: 0.53,
    fuelPriceEur: 1.79,
    startedAt: "2026-03-20T17:15:00Z",
    endedAt: "2026-03-20T17:43:00Z",
    gpsPoints: null,
  },
];

export const mockSummary: StatsSummaryResponse = {
  totalDistanceKm: 250,
  totalCo2SavedKg: 37.5,
  totalMoneySavedEur: 29.25,
  totalFuelSavedL: 16.25,
  tripCount: 24,
  currentStreak: 7,
  longestStreak: 14,
};

export const mockWeeklyData = [
  { day: "L", km: 12.4, co2: 1.86, eur: 1.45 },
  { day: "M", km: 8.2, co2: 1.23, eur: 0.96 },
  { day: "M", km: 15.1, co2: 2.27, eur: 1.77 },
  { day: "J", km: 5.5, co2: 0.83, eur: 0.64 },
  { day: "V", km: 18.3, co2: 2.75, eur: 2.14 },
  { day: "S", km: 3.2, co2: 0.48, eur: 0.37 },
  { day: "D", km: 0, co2: 0, eur: 0 },
];

export const mockLeaderboard: LeaderboardResponse = {
  entries: [
    { userId: "u-1", name: "Thomas D.", image: null, totalCo2SavedKg: 42.5, value: 42.5, rank: 1 },
    { userId: "u-2", name: "Sarah L.", image: null, totalCo2SavedKg: 38.2, value: 38.2, rank: 2 },
    { userId: "u-3", name: "Julien R.", image: null, totalCo2SavedKg: 31.8, value: 31.8, rank: 3 },
    {
      userId: "user-1",
      name: "Alex Chen",
      image: null,
      totalCo2SavedKg: 28.4,
      value: 28.4,
      rank: 4,
    },
    { userId: "u-5", name: "Léa Martin", image: null, totalCo2SavedKg: 25.1, value: 25.1, rank: 5 },
    {
      userId: "u-6",
      name: "Marc Antoine",
      image: null,
      totalCo2SavedKg: 22.9,
      value: 22.9,
      rank: 6,
    },
    {
      userId: "u-7",
      name: "Chloé Petit",
      image: null,
      totalCo2SavedKg: 19.4,
      value: 19.4,
      rank: 7,
    },
  ],
  userRank: 4,
};

export const mockAchievements: Achievement[] = [
  { id: "a-1", userId: "user-1", badgeId: "first_trip", unlockedAt: "2026-01-15T10:30:00Z" },
  { id: "a-2", userId: "user-1", badgeId: "trips_10", unlockedAt: "2026-02-10T09:00:00Z" },
  { id: "a-3", userId: "user-1", badgeId: "km_100", unlockedAt: "2026-02-25T17:00:00Z" },
  { id: "a-4", userId: "user-1", badgeId: "co2_10kg", unlockedAt: "2026-03-05T08:30:00Z" },
  { id: "a-5", userId: "user-1", badgeId: "streak_7", unlockedAt: "2026-03-20T09:00:00Z" },
];

export const allBadgeIds: BadgeId[] = [
  "first_trip",
  "trips_10",
  "trips_50",
  "trips_100",
  "km_100",
  "km_500",
  "km_1000",
  "co2_10kg",
  "co2_100kg",
  "co2_1t",
  "streak_7",
  "streak_30",
];
