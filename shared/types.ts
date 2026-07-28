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

export interface RouteStep {
  instruction: string;
  distance: number; // metres
  duration: number; // seconds
  type: number; // ORS maneuver type code
  wayPoints: [number, number]; // [startIdx, endIdx] in coordinates array
}

export interface NavigationRoute {
  coordinates: [number, number][]; // [lon, lat] pairs
  steps: RouteStep[];
  totalDistance: number; // metres
  totalDuration: number; // seconds
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

export const BADGE_CATEGORIES = [
  "volume",
  "impact",
  "regularity",
  "records",
  "habits",
  "performance",
] as const;

export type BadgeCategory = (typeof BADGE_CATEGORIES)[number];

export const BADGES = {
  // ---- 🚴 Volume (12) ----
  first_trip: { id: "first_trip", label: "Premier trajet", icon: "🚴", category: "volume" },
  trips_10: { id: "trips_10", label: "10 trajets", icon: "🔟", category: "volume" },
  trips_50: { id: "trips_50", label: "50 trajets", icon: "🏅", category: "volume" },
  trips_100: { id: "trips_100", label: "100 trajets", icon: "💯", category: "volume" },
  trips_250: { id: "trips_250", label: "250 trajets", icon: "🎖️", category: "volume" },
  trips_500: { id: "trips_500", label: "500 trajets", icon: "🏆", category: "volume" },
  km_100: { id: "km_100", label: "100 km", icon: "🛤️", category: "volume" },
  km_500: { id: "km_500", label: "500 km", icon: "🗺️", category: "volume" },
  km_1000: { id: "km_1000", label: "1 000 km", icon: "🌍", category: "volume" },
  km_2500: { id: "km_2500", label: "2 500 km", icon: "🧭", category: "volume" },
  km_5000: { id: "km_5000", label: "5 000 km", icon: "🛰️", category: "volume" },
  km_10000: { id: "km_10000", label: "10 000 km", icon: "🌐", category: "volume" },

  // ---- 🌱 Impact (13) ----
  co2_10kg: { id: "co2_10kg", label: "10 kg CO₂ économisés", icon: "🌱", category: "impact" },
  co2_100kg: { id: "co2_100kg", label: "100 kg CO₂ économisés", icon: "🌳", category: "impact" },
  co2_250kg: { id: "co2_250kg", label: "250 kg CO₂ économisés", icon: "🌿", category: "impact" },
  co2_500kg: { id: "co2_500kg", label: "500 kg CO₂ économisés", icon: "🍃", category: "impact" },
  co2_1t: { id: "co2_1t", label: "1 tonne CO₂ économisée", icon: "🌲", category: "impact" },
  fuel_25l: { id: "fuel_25l", label: "25 L économisés", icon: "⛽", category: "impact" },
  fuel_50l: { id: "fuel_50l", label: "50 L économisés", icon: "🛢️", category: "impact" },
  fuel_100l: { id: "fuel_100l", label: "100 L économisés", icon: "🚫", category: "impact" },
  fuel_250l: { id: "fuel_250l", label: "250 L économisés", icon: "🏭", category: "impact" },
  money_100: { id: "money_100", label: "100 € économisés", icon: "💰", category: "impact" },
  money_250: { id: "money_250", label: "250 € économisés", icon: "💶", category: "impact" },
  money_500: { id: "money_500", label: "500 € économisés", icon: "💸", category: "impact" },
  money_1000: { id: "money_1000", label: "1 000 € économisés", icon: "💎", category: "impact" },

  // ---- 🔥 Régularité (9) ----
  streak_3: { id: "streak_3", label: "3 jours d'affilée", icon: "🌤️", category: "regularity" },
  streak_7: { id: "streak_7", label: "7 jours de streak", icon: "🔥", category: "regularity" },
  streak_14: { id: "streak_14", label: "14 jours d'affilée", icon: "🌗", category: "regularity" },
  streak_30: { id: "streak_30", label: "30 jours de streak", icon: "⚡", category: "regularity" },
  streak_60: { id: "streak_60", label: "60 jours d'affilée", icon: "🌟", category: "regularity" },
  months_active_6: {
    id: "months_active_6",
    label: "6 mois actifs",
    icon: "📆",
    category: "regularity",
  },
  months_active_12: {
    id: "months_active_12",
    label: "12 mois actifs",
    icon: "🎂",
    category: "regularity",
  },
  weekly_goal_10: {
    id: "weekly_goal_10",
    label: "10 objectifs hebdo",
    icon: "🎯",
    category: "regularity",
  },
  monthly_goal_3: {
    id: "monthly_goal_3",
    label: "3 objectifs mensuels",
    icon: "🗓️",
    category: "regularity",
  },

  // ---- 🏆 Records (5) ----
  day_30: { id: "day_30", label: "30 km en un jour", icon: "☀️", category: "records" },
  day_50: { id: "day_50", label: "50 km en un jour", icon: "🌞", category: "records" },
  trip_25: { id: "trip_25", label: "Trajet de 25 km", icon: "🚀", category: "records" },
  trip_50: { id: "trip_50", label: "Trajet de 50 km", icon: "🛫", category: "records" },
  trip_2h: { id: "trip_2h", label: "2 h en selle", icon: "⏱️", category: "records" },

  // ---- 🕐 Habitudes (4) ----
  early_bird: { id: "early_bird", label: "Lève-tôt", icon: "🌅", category: "habits" },
  night_owl: { id: "night_owl", label: "Noctambule", icon: "🦉", category: "habits" },
  weekend_20: { id: "weekend_20", label: "20 trajets le week-end", icon: "🎒", category: "habits" },
  all_week: {
    id: "all_week",
    label: "Tous les jours de la semaine",
    icon: "📅",
    category: "habits",
  },

  // ---- ⚡ Performance (3) ----
  speed_20: { id: "speed_20", label: "20 km/h de moyenne", icon: "⚡", category: "performance" },
  speed_22: { id: "speed_22", label: "22 km/h de moyenne", icon: "💨", category: "performance" },
  speed_25: { id: "speed_25", label: "25 km/h de moyenne", icon: "🔥", category: "performance" },
} as const satisfies Record<
  string,
  { id: string; label: string; icon: string; category: BadgeCategory }
>;

export type BadgeId = keyof typeof BADGES;

/**
 * État d'un défi glissant. Défini ici parce que le serveur le produit
 * (derived-stats.ts) et le client le consomme (ChallengeCard.tsx).
 */
export interface ChallengeProgressDto {
  distanceKm: number;
  goalKm: number;
  tripCount: number;
  activeDays: number;
  co2Kg: number;
}

// ---- Impact Meter references ----

export const IMPACT_REFERENCES = [
  { label: "arbre planté (absorption annuelle)", co2Kg: 21 },
  { label: "trajet Paris–Lyon en voiture", co2Kg: 45 },
  { label: "plein d'essence (50L SP95)", co2Kg: 115 },
  { label: "vol Paris–New York (aller)", co2Kg: 400 },
] as const;
