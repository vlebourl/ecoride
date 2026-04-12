import { z } from "zod";

const coordPair = z.tuple([
  z.number().min(-180).max(180), // lon
  z.number().min(-90).max(90), // lat
]);

export const routeRequestSchema = z.object({
  start: coordPair,
  end: coordPair,
});

export type RouteRequestInput = z.infer<typeof routeRequestSchema>;
