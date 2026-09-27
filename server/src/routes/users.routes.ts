import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sum, count, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { user, session } from "../db/schema/auth";
import { trips, achievements, tripPresets, pushSubscriptions, auditLogs } from "../db/schema";
import { updateUserSchema } from "../validators/users";
import { importDataSchema } from "../validators/trips";
import { validationHook } from "../lib/validation";
import { forbidden } from "../lib/errors";
import { logAudit } from "../lib/audit";
import { evaluateAndUnlockBadges } from "../lib/badges";
import { reportBackgroundError } from "../lib/background";
import { logger } from "../lib/logger";
import { logTripWriteOutcome, observeTripPersistence } from "../lib/trip-write-observability";
import {
  calculateSavings,
  plausibleStoredSavings,
  MAX_CONSUMPTION_L100,
  MAX_FUEL_PRICE_EUR,
} from "../lib/calculations";
import { getFuelPrice } from "../lib/fuel-price";
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

  const [userTripPresets, userPushSubscriptions, userAuditLogs, userSessions] = await Promise.all([
    db.select().from(tripPresets).where(eq(tripPresets.userId, currentUser.id)),
    db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, currentUser.id)),
    db.select().from(auditLogs).where(eq(auditLogs.userId, currentUser.id)),
    db
      .select({
        id: session.id,
        userId: session.userId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .where(eq(session.userId, currentUser.id)),
  ]);

  const exportData = {
    profile: currentUser,
    trips: userTrips,
    achievements: userAchievements,
    tripPresets: userTripPresets,
    pushSubscriptions: userPushSubscriptions,
    auditLogs: userAuditLogs,
    sessions: userSessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      expiresAt: s.expiresAt,
    })),
    exportedAt: new Date().toISOString(),
  };

  // Fire-and-forget: audit log
  logAudit(currentUser.id, "data_export");

  c.header("Content-Disposition", 'attachment; filename="ecoride-data-export.json"');
  c.header("Content-Type", "application/json");
  return c.json(exportData);
});

// Current profile consumption and market fuel price, used to recalculate impossible trips.
async function currentMarket(currentUser: AuthEnv["Variables"]["user"]) {
  const consumptionL100 =
    currentUser.consumptionL100 && currentUser.consumptionL100 <= MAX_CONSUMPTION_L100
      ? currentUser.consumptionL100
      : 7;
  const fuelType = (currentUser.fuelType ?? "sp95") as "sp95" | "sp98" | "diesel" | "e85" | "gpl";
  const fallbackPrices = { sp95: 1.75, sp98: 1.85, diesel: 1.65, e85: 0.85, gpl: 0.95 };
  let fuelPriceEur = fallbackPrices[fuelType];
  try {
    const currentPrice = await getFuelPrice(fuelType);
    if (currentPrice.priceEur > 0 && currentPrice.priceEur <= MAX_FUEL_PRICE_EUR)
      fuelPriceEur = currentPrice.priceEur;
  } catch {
    // The market feed is optional; keep the import bounded during an outage.
  }
  return { consumptionL100, fuelPriceEur };
}

// POST /api/user/import — Restore exported trips. An import restores history: stored
// co2/money/fuel/fuelPrice are kept as-is when physically plausible (see
// plausibleStoredSavings), never recomputed with today's profile or prices. A trip whose
// values are missing or impossible (forged to inflate leaderboards) is not rejected; its
// savings are recalculated from the current profile and market price. The profile and
// market price are only read when such a trip exists.
usersRouter.post(
  "/import",
  zValidator("json", importDataSchema, (result, c) => {
    if (!result.success) {
      logTripWriteOutcome(
        c.get("requestId") as string | undefined,
        "import",
        "validation_rejected",
      );
    }
    return validationHook(result, c);
  }),
  async (c) => {
    const currentUser = c.get("user");
    const { trips: incoming } = c.req.valid("json");
    const requestId = c.get("requestId") as string | undefined;

    if (incoming.length === 0) {
      return c.json({ ok: true, data: { imported: 0, skipped: 0 } });
    }

    // Dedupe by timestamp and key inside the same per-user transaction as POST /trips.
    const incomingStarts = incoming.map((t) => new Date(t.startedAt));
    const incomingKeys = incoming.flatMap((t) => (t.idempotencyKey ? [t.idempotencyKey] : []));

    let market: ReturnType<typeof currentMarket> | undefined;
    const prepared = await Promise.all(
      incoming.map(async (t) => {
        const kept = plausibleStoredSavings(t);
        if (kept) return { t, savings: kept };
        const { consumptionL100, fuelPriceEur } = await (market ??= currentMarket(currentUser));
        const savings = calculateSavings({
          distanceKm: t.distanceKm,
          consumptionL100,
          fuelPriceEur,
        });
        return { t, savings: { ...savings, fuelPriceEur } };
      }),
    );

    // One wrapper for the lock, the dedupe read and the insert: any database failure is
    // logged as a persistence_error and rethrown without the driver's message.
    const imported = await observeTripPersistence(requestId, "import", () =>
      db.transaction(async (tx) => {
        // Match POST /trips' lock, so its key lookup and our import insert cannot race.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(7381, hashtext(${currentUser.id}))`);
        const existing = await tx
          .select({ startedAt: trips.startedAt, idempotencyKey: trips.idempotencyKey })
          .from(trips)
          .where(
            and(
              eq(trips.userId, currentUser.id),
              or(
                inArray(trips.startedAt, incomingStarts),
                incomingKeys.length ? inArray(trips.idempotencyKey, incomingKeys) : undefined,
              ),
            ),
          );

        const seenStarts = new Set(existing.map((r) => r.startedAt.getTime()));
        const seenKeys = new Set(
          existing.flatMap((r) => (r.idempotencyKey ? [r.idempotencyKey] : [])),
        );
        const toInsert = prepared
          .filter(({ t }) => {
            const start = new Date(t.startedAt).getTime();
            if (seenStarts.has(start) || (t.idempotencyKey && seenKeys.has(t.idempotencyKey)))
              return false;
            seenStarts.add(start);
            if (t.idempotencyKey) seenKeys.add(t.idempotencyKey);
            return true;
          })
          .map(({ t, savings }) => ({
            userId: currentUser.id,
            distanceKm: t.distanceKm,
            durationSec: t.durationSec,
            ...savings,
            startedAt: new Date(t.startedAt),
            endedAt: new Date(t.endedAt),
            gpsPoints: t.gpsPoints ?? null,
            idempotencyKey: t.idempotencyKey ?? null,
          }));

        if (toInsert.length > 0) await tx.insert(trips).values(toInsert);
        return toInsert.length;
      }),
    );

    const skipped = incoming.length - imported;
    if (skipped > 0) logTripWriteOutcome(requestId, "import", "import_skipped", skipped);

    // Re-evaluate badges since trip aggregates changed. Fire-and-forget so the
    // import response is fast; badge engine is idempotent.
    const requestLogger = logger.withContext(requestId, currentUser.id);
    reportBackgroundError(
      evaluateAndUnlockBadges(currentUser.id),
      requestLogger,
      "import_badges_failed",
      { imported },
    );

    logAudit(currentUser.id, "data_import", undefined, { imported, skipped });

    return c.json({
      ok: true,
      data: { imported, skipped },
    });
  },
);

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
