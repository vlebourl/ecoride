import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, gte, lte, count, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";
import { user } from "../db/schema/auth";
import { createTripSchema } from "../validators/trips";
import { tripsListQuery, uuidParam } from "../validators/common";
import { validationHook } from "../lib/validation";
import { calculateSavings } from "../lib/calculations";
import { getFuelPrice } from "../lib/fuel-price";
import { notFound, forbidden } from "../lib/errors";
import { paginationToOffset, buildPagination } from "../lib/pagination";
import { rateLimit } from "../lib/rate-limit";
import { evaluateAndUnlockBadges, reevaluateBadges } from "../lib/badges";
import { sendPushToUser } from "../lib/push";
import { checkLeaderboardChanges } from "../lib/leaderboard-notifications";
import { BADGES } from "@ecoride/shared/types";
import type { BadgeId } from "@ecoride/shared/types";
import type { AuthEnv } from "../types/context";

const tripsRouter = new Hono<AuthEnv>();

// POST /api/trips — Create trip (strict: 10 req/min)
tripsRouter.post(
  "/",
  rateLimit({ maxRequests: 10, prefix: "trips-create" }),
  zValidator("json", createTripSchema, validationHook),
  async (c) => {
    const data = c.req.valid("json");
    const currentUser = c.get("user");

    // Get user's vehicle profile for savings calculation
    const [profile] = await db
      .select({ consumptionL100: user.consumptionL100, fuelType: user.fuelType })
      .from(user)
      .where(eq(user.id, currentUser.id));

    const consumptionL100 = profile?.consumptionL100 ?? 7; // Default 7L/100km
    const fuelType = (profile?.fuelType ?? "sp95") as "sp95" | "sp98" | "diesel" | "e85" | "gpl";

    // Get current fuel price — non-blocking: use cache or fallback immediately
    const startPoint = data.gpsPoints?.[0];
    let fuelPriceEur: number;
    try {
      const fuelPriceData = await getFuelPrice(fuelType, startPoint?.lat, startPoint?.lng);
      fuelPriceEur = fuelPriceData.priceEur;
    } catch {
      // On any failure, use hardcoded fallback so trip creation is never blocked
      const FALLBACK: Record<string, number> = { sp95: 1.75, sp98: 1.85, diesel: 1.65, e85: 0.85, gpl: 0.95 };
      fuelPriceEur = FALLBACK[fuelType] ?? 1.75;
    }

    const savings = calculateSavings({
      distanceKm: data.distanceKm,
      consumptionL100,
      fuelPriceEur,
    });

    const [trip] = await db.insert(trips).values({
      userId: currentUser.id,
      distanceKm: data.distanceKm,
      durationSec: data.durationSec,
      co2SavedKg: savings.co2SavedKg,
      moneySavedEur: savings.moneySavedEur,
      fuelSavedL: savings.fuelSavedL,
      fuelPriceEur,
      startedAt: new Date(data.startedAt),
      endedAt: new Date(data.endedAt),
      gpsPoints: data.gpsPoints ?? null,
    }).returning();

    // Evaluate badge thresholds and unlock any newly earned achievements
    const newBadges = await evaluateAndUnlockBadges(currentUser.id);

    // Fire-and-forget: push notifications for newly unlocked badges
    for (const badgeId of newBadges) {
      const badge = BADGES[badgeId as BadgeId];
      sendPushToUser(currentUser.id, {
        title: "ecoRide",
        body: `Badge débloqué : ${badge.label} ${badge.icon}`,
      }).catch(() => {});
    }

    // Fire-and-forget: check leaderboard overtakes
    checkLeaderboardChanges(currentUser.id, savings.co2SavedKg).catch(() => {});

    return c.json({ ok: true, data: { trip, newBadges } }, 201);
  },
);

// GET /api/trips — Paginated list (own trips)
tripsRouter.get(
  "/",
  zValidator("query", tripsListQuery, validationHook),
  async (c) => {
    const { page, limit, from, to } = c.req.valid("query");
    const currentUser = c.get("user");
    const { offset } = paginationToOffset(page, limit);

    const conditions = [eq(trips.userId, currentUser.id)];
    if (from) conditions.push(gte(trips.startedAt, new Date(from)));
    if (to) conditions.push(lte(trips.startedAt, new Date(to)));

    const where = and(...conditions);

    const [data, [countResult]] = await Promise.all([
      db.select().from(trips)
        .where(where)
        .orderBy(desc(trips.startedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(trips).where(where),
    ]);

    const total = countResult?.count ?? 0;

    return c.json({
      ok: true,
      data: { trips: data },
      pagination: buildPagination(page, limit, total),
    });
  },
);

// GET /api/trips/:id — Single trip
tripsRouter.get(
  "/:id",
  zValidator("param", uuidParam, validationHook),
  async (c) => {
    const { id } = c.req.valid("param");
    const currentUser = c.get("user");

    const [trip] = await db.select().from(trips).where(eq(trips.id, id));

    if (!trip) throw notFound(`Trip ${id} not found`);
    if (trip.userId !== currentUser.id) throw forbidden();

    return c.json({ ok: true, data: { trip } });
  },
);

// DELETE /api/trips/:id — Delete trip
tripsRouter.delete(
  "/:id",
  zValidator("param", uuidParam, validationHook),
  async (c) => {
    const { id } = c.req.valid("param");
    const currentUser = c.get("user");

    const [trip] = await db.select().from(trips).where(eq(trips.id, id));

    if (!trip) throw notFound(`Trip ${id} not found`);
    if (trip.userId !== currentUser.id) throw forbidden();

    await db.delete(trips).where(eq(trips.id, id));

    // Re-evaluate badges — revoke any that are no longer earned
    const revokedBadges = await reevaluateBadges(currentUser.id);

    return c.json({ ok: true, data: { revokedBadges } });
  },
);

export { tripsRouter };
