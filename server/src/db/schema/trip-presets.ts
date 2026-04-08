import { pgTable, text, timestamp, index, uuid, integer, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { trips } from "./trips";
import { numericNumber } from "./numeric";

export const tripPresets = pgTable(
  "trip_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    distanceKm: numericNumber("distance_km", { precision: 10, scale: 3 }).notNull(),
    durationSec: integer("duration_sec"),
    gpsPoints: jsonb("gps_points"), // GpsPoint[] | null
    sourceTripId: uuid("source_trip_id").references(() => trips.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("trip_presets_user_id_idx").on(table.userId)],
);
