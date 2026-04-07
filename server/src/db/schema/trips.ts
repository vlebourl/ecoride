import { pgTable, text, integer, timestamp, jsonb, index, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { numericNumber } from "./numeric";

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    distanceKm: numericNumber("distance_km", { precision: 10, scale: 3 }).notNull(),
    durationSec: integer("duration_sec").notNull(),

    co2SavedKg: numericNumber("co2_saved_kg", { precision: 10, scale: 3 }).notNull(),
    moneySavedEur: numericNumber("money_saved_eur", { precision: 10, scale: 2 }).notNull(),
    fuelSavedL: numericNumber("fuel_saved_l", { precision: 10, scale: 3 }).notNull(),
    fuelPriceEur: numericNumber("fuel_price_eur", { precision: 10, scale: 3 }),

    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }).notNull(),

    gpsPoints: jsonb("gps_points"), // GpsPoint[] | null
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    index("trips_user_id_idx").on(table.userId),
    index("trips_started_at_idx").on(table.startedAt),
  ],
);
