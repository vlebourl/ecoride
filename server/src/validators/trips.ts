import { z } from "zod";

const gpsPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ts: z.number(),
});

export const createTripSchema = z.object({
  distanceKm: z.number().positive(),
  durationSec: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  gpsPoints: z.array(gpsPointSchema).nullable().optional(),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;
