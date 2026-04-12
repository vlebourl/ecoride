import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { routeRequestSchema } from "../validators/navigation";
import { validationHook } from "../lib/validation";
import { rateLimit } from "../lib/rate-limit";
import { env } from "../env";
import type { AuthEnv } from "../types/context";
import type { NavigationRoute } from "@ecoride/shared/types";

const navigationRouter = new Hono<AuthEnv>();

// ORS response shape (partial — only what we consume)
interface OrsStep {
  instruction: string;
  distance: number;
  duration: number;
  type: number;
  way_points: [number, number];
}

interface OrsResponse {
  features: Array<{
    geometry: { coordinates: [number, number][] };
    properties: {
      summary: { distance: number; duration: number };
      segments: Array<{ steps: OrsStep[] }>;
    };
  }>;
}

// POST /api/navigation/route
navigationRouter.post(
  "/route",
  rateLimit({ maxRequests: 30, prefix: "navigation-route" }),
  zValidator("json", routeRequestSchema, validationHook),
  async (c) => {
    if (!env.ORS_API_KEY) {
      return c.json({ ok: false, error: "Navigation service not configured" }, 503);
    }

    const { start, end } = c.req.valid("json");

    let orsRes: Response;
    try {
      orsRes = await fetch(
        "https://api.openrouteservice.org/v2/directions/cycling-regular/geojson",
        {
          method: "POST",
          headers: {
            Authorization: env.ORS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ coordinates: [start, end] }),
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      return c.json({ ok: false, error: "Routing service unavailable" }, 502);
    }

    if (orsRes.status === 429) {
      return c.json({ ok: false, error: "Routing quota exceeded" }, 429);
    }

    if (!orsRes.ok) {
      return c.json({ ok: false, error: "Routing service error" }, 502);
    }

    const orsData = (await orsRes.json()) as OrsResponse;
    const feature = orsData.features[0];

    if (!feature) {
      return c.json({ ok: false, error: "No route found" }, 404);
    }

    const steps = feature.properties.segments[0]?.steps ?? [];

    const route: NavigationRoute = {
      coordinates: feature.geometry.coordinates,
      steps: steps.map((s) => ({
        instruction: s.instruction,
        distance: s.distance,
        duration: s.duration,
        type: s.type,
        wayPoints: s.way_points,
      })),
      totalDistance: feature.properties.summary.distance,
      totalDuration: feature.properties.summary.duration,
    };

    return c.json({ ok: true, data: { route } });
  },
);

export { navigationRouter };
