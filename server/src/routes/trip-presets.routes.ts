import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { tripPresets, trips } from "../db/schema";
import { validationHook } from "../lib/validation";
import { notFound, forbidden } from "../lib/errors";
import { uuidParam } from "../validators/common";
import { createTripPresetSchema, createTripPresetFromTripSchema } from "../validators/trip-presets";
import type { AuthEnv } from "../types/context";

const tripPresetsRouter = new Hono<AuthEnv>();

function serializeTripPreset(tripPreset: typeof tripPresets.$inferSelect) {
  return {
    ...tripPreset,
    createdAt: tripPreset.createdAt.toISOString(),
    updatedAt: tripPreset.updatedAt.toISOString(),
  };
}

tripPresetsRouter.get("/", async (c) => {
  const currentUser = c.get("user");
  const data = await db
    .select()
    .from(tripPresets)
    .where(eq(tripPresets.userId, currentUser.id))
    .orderBy(desc(tripPresets.updatedAt));

  return c.json({
    ok: true,
    data: { tripPresets: data.map(serializeTripPreset) },
  });
});

tripPresetsRouter.post(
  "/",
  zValidator("json", createTripPresetSchema, validationHook),
  async (c) => {
    const currentUser = c.get("user");
    const data = c.req.valid("json");

    const [tripPreset] = await db
      .insert(tripPresets)
      .values({
        userId: currentUser.id,
        label: data.label.trim(),
        distanceKm: data.distanceKm,
        durationSec: data.durationSec ?? null,
        gpsPoints: data.gpsPoints ?? null,
      })
      .returning();

    if (!tripPreset) {
      throw new Error("Trip preset creation failed: insert returned no row");
    }

    return c.json({ ok: true, data: { tripPreset: serializeTripPreset(tripPreset) } }, 201);
  },
);

tripPresetsRouter.post(
  "/from-trip/:id",
  zValidator("param", uuidParam, validationHook),
  zValidator("json", createTripPresetFromTripSchema, validationHook),
  async (c) => {
    const currentUser = c.get("user");
    const { id } = c.req.valid("param");
    const data = c.req.valid("json");

    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    if (!trip) throw notFound(`Trip ${id} not found`);
    if (trip.userId !== currentUser.id) throw forbidden();

    const [tripPreset] = await db
      .insert(tripPresets)
      .values({
        userId: currentUser.id,
        label: data.label.trim(),
        distanceKm: trip.distanceKm,
        durationSec: trip.durationSec,
        gpsPoints: trip.gpsPoints,
        sourceTripId: trip.id,
      })
      .returning();

    if (!tripPreset) {
      throw new Error("Trip preset creation failed: insert returned no row");
    }

    return c.json({ ok: true, data: { tripPreset: serializeTripPreset(tripPreset) } }, 201);
  },
);

tripPresetsRouter.delete("/:id", zValidator("param", uuidParam, validationHook), async (c) => {
  const currentUser = c.get("user");
  const { id } = c.req.valid("param");

  const [tripPreset] = await db.select().from(tripPresets).where(eq(tripPresets.id, id));
  if (!tripPreset) throw notFound(`Trip preset ${id} not found`);
  if (tripPreset.userId !== currentUser.id) throw forbidden();

  await db
    .delete(tripPresets)
    .where(and(eq(tripPresets.id, id), eq(tripPresets.userId, currentUser.id)));

  return c.json({ ok: true });
});

export { tripPresetsRouter };
