import type { User, Trip, Achievement, GpsPoint, FuelType, WeekDay } from "./types";

// ---- Route definitions ----

export const API_ROUTES = {
  // Auth (Better Auth handles these)
  AUTH_GOOGLE: { method: "GET", path: "/api/auth/sign-in/social" },
  AUTH_SESSION: { method: "GET", path: "/api/auth/get-session" },
  AUTH_SIGN_OUT: { method: "POST", path: "/api/auth/sign-out" },

  // Trips
  TRIPS_LIST: { method: "GET", path: "/api/trips" },
  TRIPS_CREATE: { method: "POST", path: "/api/trips" },
  TRIPS_GET: { method: "GET", path: "/api/trips/:id" },
  TRIPS_DELETE: { method: "DELETE", path: "/api/trips/:id" },

  // Stats
  STATS_SUMMARY: { method: "GET", path: "/api/stats/summary" },
  STATS_LEADERBOARD: { method: "GET", path: "/api/stats/leaderboard" },

  // User profile
  USER_PROFILE: { method: "GET", path: "/api/user/profile" },
  USER_UPDATE: { method: "PATCH", path: "/api/user/profile" },

  // Admin
  ADMIN_GRANT_USER: { method: "POST", path: "/api/admin/users/grant" },
  ADMIN_REVOKE_USER: { method: "POST", path: "/api/admin/users/revoke" },
  ADMIN_GRANT_SUPER73: { method: "POST", path: "/api/admin/users/super73/grant" },
  ADMIN_REVOKE_SUPER73: { method: "POST", path: "/api/admin/users/super73/revoke" },
  ADMIN_DELETE_USER: { method: "POST", path: "/api/admin/users/delete" },

  // Achievements
  ACHIEVEMENTS_LIST: { method: "GET", path: "/api/achievements" },

  // Push subscriptions
  PUSH_SUBSCRIBE: { method: "POST", path: "/api/push/subscribe" },
  PUSH_UNSUBSCRIBE: { method: "DELETE", path: "/api/push/subscribe" },

  // Fuel prices
  FUEL_PRICE: { method: "GET", path: "/api/fuel-price" },

  // Health
  HEALTH: { method: "GET", path: "/api/health" },
} as const;

// ---- Request payloads ----

export interface CreateTripRequest {
  distanceKm: number;
  durationSec: number;
  startedAt: string; // ISO 8601
  endedAt: string; // ISO 8601
  gpsPoints?: GpsPoint[] | null;
  idempotencyKey?: string;
}

export interface UpdateUserRequest {
  vehicleModel?: string;
  fuelType?: FuelType;
  consumptionL100?: number;
  mileage?: number;
  timezone?: string;
  leaderboardOptOut?: boolean;
  reminderEnabled?: boolean;
  reminderTime?: string; // HH:MM
  reminderDays?: WeekDay[];
  super73Enabled?: boolean;
}

export interface GrantAdminRequest {
  email: string;
}

export interface GrantAdminResponse {
  user: Pick<User, "id" | "name" | "email" | "isAdmin" | "super73Enabled">;
  granted: boolean;
}

export interface AdminUserAccessRequest {
  userId: string;
}

export interface RevokeAdminResponse {
  user: Pick<User, "id" | "name" | "email" | "isAdmin" | "super73Enabled">;
  revoked: boolean;
}

export interface GrantSuper73Response {
  user: Pick<User, "id" | "name" | "email" | "isAdmin" | "super73Enabled">;
  granted: boolean;
}

export interface RevokeSuper73Response {
  user: Pick<User, "id" | "name" | "email" | "isAdmin" | "super73Enabled">;
  revoked: boolean;
}

export interface DeleteAdminUserResponse {
  deletedUserId: string;
  deletedEmail: string;
}

export interface PushSubscribeRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface FuelPriceQuery {
  lat: number;
  lng: number;
  type: FuelType;
}

export type StatsPeriod = "day" | "week" | "month" | "year" | "all";

export type LeaderboardCategory = "co2" | "streak" | "trips" | "speed" | "money" | "distance";

// ---- Response payloads ----

export interface TripListResponse {
  trips: Trip[];
  total: number;
}

export interface TripResponse {
  trip: Trip;
}

export interface StatsSummaryResponse {
  totalDistanceKm: number;
  totalCo2SavedKg: number;
  totalMoneySavedEur: number;
  totalFuelSavedL: number;
  tripCount: number;
  currentStreak: number;
  longestStreak: number;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  image: string | null;
  totalCo2SavedKg: number;
  value: number;
  rank: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  userRank: number | null;
}

export interface UserProfileResponse {
  user: User;
}

export interface AchievementsResponse {
  achievements: Achievement[];
}

export interface FuelPriceResponse {
  priceEur: number;
  fuelType: FuelType;
  stationName?: string;
  updatedAt: string;
}

// ---- Error handling ----

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
