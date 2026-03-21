import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, sum, count, sql } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { trips } from "../db/schema";
import { updateUserSchema } from "../validators/users";
import { validationHook } from "../lib/validation";
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
usersRouter.patch(
  "/profile",
  zValidator("json", updateUserSchema, validationHook),
  async (c) => {
    const data = c.req.valid("json");
    const currentUser = c.get("user");

    if (Object.keys(data).length === 0) {
      return c.json({ ok: true, data: { user: currentUser } });
    }

    const [updated] = await db
      .update(user)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(user.id, currentUser.id))
      .returning();

    return c.json({ ok: true, data: { user: updated } });
  },
);

export { usersRouter };
