import { useState, useEffect, useCallback } from "react";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentPushSubscription,
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

  // Check initial state
  useEffect(() => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    getCurrentPushSubscription().then((sub) => {
      setStatus(sub ? "subscribed" : "unsubscribed");
    });
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
