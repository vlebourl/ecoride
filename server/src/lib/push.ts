import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { pushSubscriptions } from "../db/schema";
import { env } from "../env";

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    console.warn("[push] VAPID keys not configured — push notifications disabled");
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
): Promise<boolean> {
  ensureInitialized();
  if (!initialized) return false;

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
      console.log(`[push] Removed expired subscription ${subscription.id}`);
    } else {
      console.error(`[push] Failed to send to ${subscription.id}:`, err);
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
    const ok = await sendPushNotification(sub, payload);
    if (ok) sent++;
  }
  return sent;
}
