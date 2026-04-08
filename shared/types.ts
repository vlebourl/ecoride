// ---- Core domain types (API response shapes) ----

export interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  vehicleModel: string | null;
  fuelType: FuelType | null;
  consumptionL100: number | null;
  mileage: number | null;
  timezone: string | null;
  leaderboardOptOut: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  reminderDays: WeekDay[] | null;
  isAdmin: boolean;
  super73Enabled: boolean;
  super73AutoModeEnabled: boolean;
  super73DefaultMode: Super73Mode | null;
  super73DefaultAssist: number | null;
  super73DefaultLight: boolean | null;
  super73AutoModeLowSpeedKmh: number | null;
  super73AutoModeHighSpeedKmh: number | null;
  createdAt: string;
}

export interface Trip {
  id: string;
  userId: string;
  distanceKm: number;
  durationSec: number;
  co2SavedKg: number;
  moneySavedEur: number;
  fuelSavedL: number;
  fuelPriceEur: number | null;
  startedAt: string;
  endedAt: string;
  gpsPoints: GpsPoint[] | null;
}

export interface TripPreset {
  id: string;
  userId: string;
  label: string;
  distanceKm: number;
  durationSec: number | null;
  gpsPoints: GpsPoint[] | null;
  sourceTripId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GpsPoint {
  lat: number;
  lng: number;
  ts: number; // Unix timestamp ms
}

export interface Achievement {
  id: string;
  userId: string;
  badgeId: BadgeId;
  unlockedAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
}

export type Super73Mode = "eco" | "tour" | "sport" | "race";

// ---- Enums & constants ----

export type FuelType = "sp95" | "sp98" | "diesel" | "e85" | "gpl";

export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const FUEL_TYPES: readonly FuelType[] = ["sp95", "sp98", "diesel", "e85", "gpl"] as const;

export const WEEK_DAYS: readonly WeekDay[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

// CO2 emission factor: kg CO2 per liter of fuel (ADEME)
export const CO2_KG_PER_LITER = 2.31;

// ---- Badge definitions (static, not in DB) ----

export const BADGES = {
  first_trip: { id: "first_trip", label: "Premier trajet", icon: "🚴" },
  trips_10: { id: "trips_10", label: "10 trajets", icon: "🔟" },
  trips_50: { id: "trips_50", label: "50 trajets", icon: "🏅" },
  trips_100: { id: "trips_100", label: "100 trajets", icon: "💯" },
  km_100: { id: "km_100", label: "100 km", icon: "🛤️" },
  km_500: { id: "km_500", label: "500 km", icon: "🗺️" },
  km_1000: { id: "km_1000", label: "1 000 km", icon: "🌍" },
  co2_10kg: { id: "co2_10kg", label: "10 kg CO₂ économisés", icon: "🌱" },
  co2_100kg: { id: "co2_100kg", label: "100 kg CO₂ économisés", icon: "🌳" },
  co2_1t: { id: "co2_1t", label: "1 tonne CO₂ économisée", icon: "🌲" },
  streak_7: { id: "streak_7", label: "7 jours de streak", icon: "🔥" },
  streak_30: { id: "streak_30", label: "30 jours de streak", icon: "⚡" },
} as const;

export type BadgeId = keyof typeof BADGES;

// ---- Impact Meter references ----

export const IMPACT_REFERENCES = [
  { label: "arbre planté (absorption annuelle)", co2Kg: 21 },
  { label: "trajet Paris–Lyon en voiture", co2Kg: 45 },
  { label: "plein d'essence (50L SP95)", co2Kg: 115 },
  { label: "vol Paris–New York (aller)", co2Kg: 400 },
] as const;
