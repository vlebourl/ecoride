import { apiFetch } from "./api";

/**
 * Convert a URL-safe base64 string to a Uint8Array
 * (needed for applicationServerKey in pushManager.subscribe).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Check whether the browser supports push notifications. */
export function isPushSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

/** Fetch the VAPID public key from the server. */
async function getVapidPublicKey(): Promise<string> {
  const res = await apiFetch<{ ok: boolean; data: { publicKey: string } }>("/push/vapid-key");
  return res.data.publicKey;
}

/**
 * Subscribe the browser to push notifications.
 * Returns the PushSubscription on success, or null on failure.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return null;
  }

  const registration = await navigator.serviceWorker.ready;
  const vapidPublicKey = await getVapidPublicKey();

  if (!vapidPublicKey || vapidPublicKey.length < 20) {
    console.warn("[push] VAPID public key is empty or invalid — push disabled");
    return null;
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
    });
  } catch (err) {
    console.error("[push] Failed to subscribe:", err);
    return null;
  }

  // Send subscription to server
  const keys = subscription.toJSON().keys!;
  await apiFetch("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    }),
  });

  return subscription;
}

/**
 * Unsubscribe the browser from push notifications.
 */
export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    // Remove from server first
    await apiFetch("/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    // Then unsubscribe locally
    await subscription.unsubscribe();
  }
}

/**
 * Get the current push subscription, if any.
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Silently re-sync the current browser push subscription with the server.
 * Called on every app load when permission is "granted" to ensure the server
 * always has the latest FCM endpoint (which changes after SW updates).
 * If no browser subscription exists but permission is granted, re-subscribes.
 */
export async function syncPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported() || Notification.permission !== "granted") return null;

  try {
    let subscription = await getCurrentPushSubscription();

    if (!subscription) {
      // Permission granted but no subscription — re-subscribe silently
      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = await getVapidPublicKey();
      if (!vapidPublicKey || vapidPublicKey.length < 20) return null;

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });
    }

    // Send current subscription to server (upserts — updates endpoint if changed)
    const keys = subscription.toJSON().keys!;
    await apiFetch("/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      }),
    });

    return subscription;
  } catch (err) {
    console.warn("[push] sync failed:", err);
    return null;
  }
}
