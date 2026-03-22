import { z } from "zod";

const gpsPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ts: z.number(),
});

export const createTripSchema = z.object({
  distanceKm: z.number().positive().max(500),
  durationSec: z.number().int().min(1).max(86400),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  gpsPoints: z.array(gpsPointSchema).max(10000).nullable().optional(),
}).refine(
  (data) => new Date(data.startedAt) < new Date(data.endedAt),
  { message: "startedAt must be before endedAt", path: ["startedAt"] }
);

export type CreateTripInput = z.infer<typeof createTripSchema>;
