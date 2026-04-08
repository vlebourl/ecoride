import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { numericNumber } from "./numeric";

// Better Auth core table — extended with EcoRide user fields.
// Better Auth expects: id, name, email, emailVerified, image, createdAt, updatedAt.
// We add vehicle profile + preferences as extra columns.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),

  // ---- EcoRide custom fields ----
  vehicleModel: text("vehicle_model"),
  fuelType: text("fuel_type"),
  consumptionL100: numericNumber("consumption_l100", { precision: 5, scale: 2 }),
  mileage: integer("mileage"),
  timezone: text("timezone"),
  leaderboardOptOut: boolean("leaderboard_opt_out").notNull().default(false),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderTime: text("reminder_time"), // HH:MM
  reminderDays: text("reminder_days").array(), // ["mon","tue",...]
  isAdmin: boolean("is_admin").notNull().default(false),
  super73Enabled: boolean("super73_enabled").notNull().default(false),
  super73AutoModeEnabled: boolean("super73_auto_mode_enabled").notNull().default(false),
  super73DefaultMode: text("super73_default_mode"),
  super73DefaultAssist: integer("super73_default_assist"),
  super73DefaultLight: boolean("super73_default_light"),
  super73AutoModeLowSpeedKmh: numericNumber("super73_auto_mode_low_speed_kmh", {
    precision: 5,
    scale: 2,
  }),
  super73AutoModeHighSpeedKmh: numericNumber("super73_auto_mode_high_speed_kmh", {
    precision: 5,
    scale: 2,
  }),
});

// Better Auth session table
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// Better Auth account table (OAuth providers)
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
    mode: "date",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// Better Auth verification table (email verification, password reset)
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
});
