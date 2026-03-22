import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { pushSubscriptions } from "../db/schema";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "../validators/push";
import { validationHook } from "../lib/validation";
import { sendPushToUser } from "../lib/push";
import { env } from "../env";
import type { AuthEnv } from "../types/context";

const pushRouter = new Hono<AuthEnv>();

// GET /api/push/vapid-key — Public VAPID key for the frontend
pushRouter.get("/vapid-key", (c) => {
  return c.json({
    ok: true,
    data: { publicKey: env.VAPID_PUBLIC_KEY },
  });
});

// POST /api/push/subscribe — Register push subscription (upsert)
pushRouter.post(
  "/subscribe",
  zValidator("json", pushSubscribeSchema, validationHook),
  async (c) => {
    const { endpoint, keys } = c.req.valid("json");
    const currentUser = c.get("user");

    // Check if subscription already exists for this endpoint
    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, currentUser.id),
        eq(pushSubscriptions.endpoint, endpoint),
      ));

    if (existing) {
      // Update keys if changed
      await db
        .update(pushSubscriptions)
        .set({ p256dh: keys.p256dh, auth: keys.auth })
        .where(eq(pushSubscriptions.id, existing.id));

      return c.json({ ok: true, data: { subscriptionId: existing.id } });
    }

    const [sub] = await db.insert(pushSubscriptions).values({
      userId: currentUser.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    }).returning();

    return c.json({ ok: true, data: { subscriptionId: sub!.id } }, 201);
  },
);

// DELETE /api/push/subscribe — Unregister push subscription
pushRouter.delete(
  "/subscribe",
  zValidator("json", pushUnsubscribeSchema, validationHook),
  async (c) => {
    const { endpoint } = c.req.valid("json");
    const currentUser = c.get("user");

    await db
      .delete(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, currentUser.id),
        eq(pushSubscriptions.endpoint, endpoint),
      ));

    return c.json({ ok: true, data: null });
  },
);

// POST /api/push/test — Send test notification to current user
pushRouter.post("/test", async (c) => {
  const currentUser = c.get("user");

  const sent = await sendPushToUser(currentUser.id, {
    title: "ecoRide",
    body: "Les notifications push fonctionnent ! 🚴",
    icon: "/icons/icon-192.png",
    url: "/",
  });

  return c.json({ ok: true, data: { sent } });
});

export { pushRouter };
