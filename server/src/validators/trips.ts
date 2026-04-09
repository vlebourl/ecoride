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

export const createTripSchema = z
  .object({
    distanceKm: z.number().positive().max(500),
    durationSec: z.number().int().min(1).max(86400),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    gpsPoints: z.array(gpsPointSchema).max(10000).nullable().optional(),
    idempotencyKey: z.string().uuid().optional(),
  })
  .refine((data) => new Date(data.startedAt) < new Date(data.endedAt), {
    message: "startedAt must be before endedAt",
    path: ["startedAt"],
  });

export type CreateTripInput = z.infer<typeof createTripSchema>;
