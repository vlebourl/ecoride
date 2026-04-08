import { z } from "zod";

const gpsPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ts: z.number(),
});

export const createTripPresetSchema = z.object({
  label: z.string().trim().min(1).max(120),
  distanceKm: z.number().positive().max(500),
  durationSec: z.number().int().min(1).max(86400).nullable().optional(),
  gpsPoints: z.array(gpsPointSchema).max(10000).nullable().optional(),
});

export const createTripPresetFromTripSchema = z.object({
  label: z.string().trim().min(1).max(120),
});

export type CreateTripPresetInput = z.infer<typeof createTripPresetSchema>;
export type CreateTripPresetFromTripInput = z.infer<typeof createTripPresetFromTripSchema>;
