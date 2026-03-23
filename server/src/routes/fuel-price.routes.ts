import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { FUEL_TYPES } from "@ecoride/shared/types";
import { getFuelPrice } from "../lib/fuel-price";
import { validationHook } from "../lib/validation";
import type { AuthEnv } from "../types/context";

const fuelPriceQuery = z.object({
  type: z.enum(FUEL_TYPES as unknown as [string, ...string[]]).default("sp95"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const fuelPriceRouter = new Hono<AuthEnv>();

// GET /api/fuel-price
fuelPriceRouter.get("/", zValidator("query", fuelPriceQuery, validationHook), async (c) => {
  const { type, lat, lng } = c.req.valid("query");
  const result = await getFuelPrice(type as "sp95" | "sp98" | "diesel" | "e85" | "gpl", lat, lng);

  return c.json({
    ok: true,
    data: {
      priceEur: result.priceEur,
      fuelType: result.fuelType,
      stationName: result.stationName,
      updatedAt: result.updatedAt,
    },
  });
});

export { fuelPriceRouter };
