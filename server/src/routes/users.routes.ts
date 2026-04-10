import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sum, count, inArray } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { trips, achievements } from "../db/schema";
import { updateUserSchema } from "../validators/users";
import { importDataSchema } from "../validators/trips";
import { validationHook } from "../lib/validation";
import { forbidden } from "../lib/errors";
import { logAudit } from "../lib/audit";
import { evaluateAndUnlockBadges } from "../lib/badges";
import { reportBackgroundError } from "../lib/background";
import { logger } from "../lib/logger";
import type { AuthEnv } from "../types/context";

const usersRouter = new Hono<AuthEnv>();

// GET /api/user/profile — Current user profile + stats
usersRouter.get("/profile", async (c) => {
  const currentUser = c.get("user");

  // Aggregate stats
  const [stats] = await db
    .select({
      totalDistanceKm: sum(trips.distanceKm).mapWith(Number),
      totalCo2SavedKg: sum(trips.co2SavedKg).mapWith(Number),
      totalMoneySavedEur: sum(trips.moneySavedEur).mapWith(Number),
      totalFuelSavedL: sum(trips.fuelSavedL).mapWith(Number),
      tripCount: count(),
    })
    .from(trips)
    .where(eq(trips.userId, currentUser.id));

  return c.json({
    ok: true,
    data: {
      user: currentUser,
      stats: {
        totalDistanceKm: stats?.totalDistanceKm ?? 0,
        totalCo2SavedKg: stats?.totalCo2SavedKg ?? 0,
        totalMoneySavedEur: stats?.totalMoneySavedEur ?? 0,
        totalFuelSavedL: stats?.totalFuelSavedL ?? 0,
        tripCount: stats?.tripCount ?? 0,
      },
    },
  });
});

// PATCH /api/user/profile — Update vehicle/preferences
usersRouter.patch("/profile", zValidator("json", updateUserSchema, validationHook), async (c) => {
  const data = c.req.valid("json");
  const currentUser = c.get("user");

  if (Object.keys(data).length === 0) {
    return c.json({ ok: true, data: { user: currentUser } });
  }
  if (data.super73Enabled === true && currentUser.super73Enabled !== true) {
    throw forbidden("Super73 access required");
  }

  const [updated] = await db
    .update(user)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(user.id, currentUser.id))
    .returning();

  // Fire-and-forget: audit log
  logAudit(currentUser.id, "update_profile", undefined, { fields: Object.keys(data) });

  return c.json({ ok: true, data: { user: updated } });
});

// GET /api/user/export — GDPR data export
usersRouter.get("/export", async (c) => {
  const currentUser = c.get("user");

  const userTrips = await db.select().from(trips).where(eq(trips.userId, currentUser.id));

  const userAchievements = await db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, currentUser.id));

  const exportData = {
    profile: currentUser,
    trips: userTrips,
    achievements: userAchievements,
    exportedAt: new Date().toISOString(),
  };

  // Fire-and-forget: audit log
  logAudit(currentUser.id, "data_export");

  c.header("Content-Disposition", 'attachment; filename="ecoride-data-export.json"');
  c.header("Content-Type", "application/json");
  return c.json(exportData);
});

// POST /api/user/import — Restore exported trips (preserves historical values)
usersRouter.post("/import", zValidator("json", importDataSchema, validationHook), async (c) => {
  const currentUser = c.get("user");
  const { trips: incoming } = c.req.valid("json");

  if (incoming.length === 0) {
    return c.json({ ok: true, data: { imported: 0, skipped: 0 } });
  }

  // Dedupe against existing trips by startedAt timestamp for this user.
  const incomingStarts = incoming.map((t) => new Date(t.startedAt));
  const existing = await db
    .select({ startedAt: trips.startedAt })
    .from(trips)
    .where(and(eq(trips.userId, currentUser.id), inArray(trips.startedAt, incomingStarts)));

  const existingSet = new Set(existing.map((r) => r.startedAt.getTime()));

  const toInsert = incoming
    .filter((t) => !existingSet.has(new Date(t.startedAt).getTime()))
    .map((t) => ({
      userId: currentUser.id,
      distanceKm: t.distanceKm,
      durationSec: t.durationSec,
      co2SavedKg: t.co2SavedKg,
      moneySavedEur: t.moneySavedEur,
      fuelSavedL: t.fuelSavedL,
      fuelPriceEur: t.fuelPriceEur ?? null,
      startedAt: new Date(t.startedAt),
      endedAt: new Date(t.endedAt),
      gpsPoints: t.gpsPoints ?? null,
      idempotencyKey: t.idempotencyKey ?? null,
    }));

  if (toInsert.length > 0) {
    await db.insert(trips).values(toInsert);
  }

  // Re-evaluate badges since trip aggregates changed. Fire-and-forget so the
  // import response is fast; badge engine is idempotent.
  const requestLogger = logger.withContext(
    c.get("requestId") as string | undefined,
    currentUser.id,
  );
  reportBackgroundError(
    evaluateAndUnlockBadges(currentUser.id),
    requestLogger,
    "import_badges_failed",
    { imported: toInsert.length },
  );

  logAudit(currentUser.id, "data_import", undefined, {
    imported: toInsert.length,
    skipped: incoming.length - toInsert.length,
  });

  return c.json({
    ok: true,
    data: { imported: toInsert.length, skipped: incoming.length - toInsert.length },
  });
});

// DELETE /api/user/profile — Delete account (GDPR right to erasure)
usersRouter.delete("/profile", async (c) => {
  const currentUser = c.get("user");

  // Audit BEFORE deletion (cascading delete will remove audit_logs too,
  // but the structured log line is kept in stdout)
  logAudit(currentUser.id, "delete_account");

  await db.delete(user).where(eq(user.id, currentUser.id));

  return c.json({ ok: true });
});

export { usersRouter };
