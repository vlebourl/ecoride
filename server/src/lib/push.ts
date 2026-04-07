import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { pushSubscriptions } from "../db/schema";
import { env } from "../env";
import { logger } from "./logger";
import { getPushEndpointHost, type PushLogContext } from "./push-context";

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    logger.warn("vapid_keys_not_configured");
    return;
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  initialized = true;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

/**
 * Send a push notification to a single subscription.
 * Returns true if sent, false if failed (and cleans up expired subscriptions).
 */
export async function sendPushNotification(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  context?: PushLogContext,
): Promise<boolean> {
  ensureInitialized();
  if (!initialized) return false;

  const logData = {
    subscriptionId: subscription.id,
    endpointHost: getPushEndpointHost(subscription.endpoint),
    ...(context?.userId ? { userId: context.userId } : {}),
    ...(context?.source ? { source: context.source } : {}),
  };

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      // Subscription expired or invalid — clean up
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      logger.info("push_subscription_expired", {
        ...logData,
        statusCode,
      });
    } else {
      logger.error("push_send_failed", {
        ...logData,
        statusCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return false;
  }
}

/**
 * Send a push notification to all subscriptions for a user.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  for (const sub of subs) {
    const ok = await sendPushNotification(sub, payload, { userId, source: "user" });
    if (ok) sent++;
  }
  return sent;
}

/**
 * Broadcast a push notification to all subscriptions, or a subset by user IDs.
 */
export async function sendPushBroadcast(
  payload: PushPayload,
  userIds?: string[],
): Promise<{ sent: number; failed: number }> {
  const subs =
    userIds && userIds.length > 0
      ? await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds))
      : await db.select().from(pushSubscriptions);

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    const ok = await sendPushNotification(sub, payload, {
      userId: sub.userId,
      source: "broadcast",
    });
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
