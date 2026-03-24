import { useState, useEffect, useCallback } from "react";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  syncPushSubscription,
} from "@/lib/push";
import { useUpdateProfile } from "./queries";

export type PushStatus =
  | "loading" // checking current state
  | "unsupported" // browser doesn't support push
  | "denied" // user denied permission
  | "subscribed" // active subscription
  | "unsubscribed"; // no subscription, can enable

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const updateProfile = useUpdateProfile();

  // Check initial state and silently re-sync subscription with server
  useEffect(() => {
    let ignore = false;

    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    // If permission is granted, sync subscription with server (handles
    // stale FCM endpoints after SW updates). If not granted, just check state.
    syncPushSubscription().then((sub) => {
      if (!ignore) setStatus(sub ? "subscribed" : "unsubscribed");
    });

    return () => {
      ignore = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    try {
      if (status === "subscribed") {
        // Unsubscribe
        await unsubscribeFromPush();
        updateProfile.mutate({ reminderEnabled: false });
        setStatus("unsubscribed");
      } else {
        // Subscribe
        const subscription = await subscribeToPush();
        if (subscription) {
          updateProfile.mutate({ reminderEnabled: true });
          setStatus("subscribed");
        } else {
          // Permission denied
          setStatus("denied");
        }
      }
    } catch (err) {
      console.error("Push notification toggle failed:", err);
    } finally {
      setBusy(false);
    }
  }, [status, busy, updateProfile]);

  return { status, busy, toggle };
}
