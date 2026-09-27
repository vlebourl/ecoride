import { z } from "zod";

function normalizeLegacyTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  // Legacy queued trips may predate per-point timestamps; store 0 so the
  // client falls back to a solid trace instead of rejecting the whole trip.
  return 0;
}

const gpsPointSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  ts: z.preprocess(normalizeLegacyTimestamp, z.number().min(0)),
});

// Tolerance for clock drift between client and server.
const FUTURE_TIMESTAMP_TOLERANCE_MS = 60_000;
const idempotencyKeySchema = z.string().max(36).uuid();

export const createTripSchema = z
  .object({
    distanceKm: z.number().positive().max(500),
    durationSec: z.number().int().min(1).max(86400),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    gpsPoints: z.array(gpsPointSchema).max(10000).nullable().optional(),
    idempotencyKey: idempotencyKeySchema.optional(),
  })
  .refine((data) => new Date(data.startedAt) < new Date(data.endedAt), {
    message: "startedAt must be before endedAt",
    path: ["startedAt"],
  })
  .refine(
    (data) => new Date(data.endedAt).getTime() <= Date.now() + FUTURE_TIMESTAMP_TOLERANCE_MS,
    {
      message: "endedAt cannot be in the future",
      path: ["endedAt"],
    },
  );

const importTripSchema = z
  .object({
    distanceKm: z.number().positive().max(500),
    durationSec: z.number().int().min(1).max(86400),
    // Legacy exports include these values, but the import route recalculates them.
    co2SavedKg: z.number().nonnegative().optional(),
    moneySavedEur: z.number().nonnegative().optional(),
    fuelSavedL: z.number().nonnegative().optional(),
    fuelPriceEur: z.number().positive().nullable().optional(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    gpsPoints: z.array(gpsPointSchema).max(10000).nullable().optional(),
    idempotencyKey: idempotencyKeySchema.nullable().optional(),
  })
  .refine((data) => new Date(data.startedAt) < new Date(data.endedAt), {
    message: "startedAt must be before endedAt",
    path: ["startedAt"],
  })
  .refine(
    (data) => new Date(data.endedAt).getTime() <= Date.now() + FUTURE_TIMESTAMP_TOLERANCE_MS,
    {
      message: "endedAt cannot be in the future",
      path: ["endedAt"],
    },
  )
  .refine(
    (data) =>
      data.durationSec * 1000 <=
      new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime() + 60_000,
    {
      message: "durationSec exceeds elapsed time",
      path: ["durationSec"],
    },
  )
  .refine((data) => data.distanceKm <= data.durationSec / 36, {
    message: "distanceKm exceeds 100 km/h",
    path: ["distanceKm"],
  });

export const importDataSchema = z.object({
  trips: z.array(importTripSchema).max(5000),
});
