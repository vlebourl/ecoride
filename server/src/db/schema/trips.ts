import { pgTable, text, real, integer, timestamp, jsonb, index, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    distanceKm: real("distance_km").notNull(),
    durationSec: integer("duration_sec").notNull(),

    co2SavedKg: real("co2_saved_kg").notNull(),
    moneySavedEur: real("money_saved_eur").notNull(),
    fuelSavedL: real("fuel_saved_l").notNull(),
    fuelPriceEur: real("fuel_price_eur"),

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
