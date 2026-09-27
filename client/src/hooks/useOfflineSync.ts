import { useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import {
  QUEUE_CHANGED_EVENT,
  getPendingTrips,
  recordRejectedTrip,
  removePendingTrip,
} from "@/lib/offline-queue";
import type { Trip } from "@ecoride/shared/types";

function isTerminalTripSyncError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 400 || error.status === 409);
}

function getTerminalReason(error: ApiError): string {
  if (error.status === 409) return "Trajet rejeté : chevauchement avec un trajet déjà enregistré.";
  return "Trajet rejeté : données incompatibles avec la version actuelle.";
}

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);
  const retryRequestedRef = useRef(false);

  const syncPending = useCallback(async () => {
    retryRequestedRef.current = true;
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      while (retryRequestedRef.current) {
        retryRequestedRef.current = false;
        const pending = getPendingTrips();
        let queueChanged = false;
        for (const trip of pending) {
          if (!trip.idempotencyKey) continue;
          try {
            await apiFetch<{ ok: boolean; data: { trip: Trip } }>("/trips", {
              method: "POST",
              body: JSON.stringify(trip),
            });
            removePendingTrip(trip.idempotencyKey);
            queueChanged = true;
          } catch (error) {
            if (isTerminalTripSyncError(error)) {
              recordRejectedTrip(trip, {
                status: error.status,
                reason: getTerminalReason(error),
              });
              removePendingTrip(trip.idempotencyKey);
              queueChanged = true;
            }
          }
        }
        if (queueChanged) {
          queryClient.invalidateQueries({ queryKey: ["trips"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
          queryClient.invalidateQueries({ queryKey: ["achievements"] });
          queryClient.invalidateQueries({ queryKey: ["profile"] });
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    // Try on mount
    syncPending();

    // Retry whenever something could have unblocked the queue:
    //   - the browser reports we are back online
    //   - a new trip was enqueued by handleSaveTrip onError (issue #231 — in
    //     a running PWA the AppShell never remounts, so without this event
    //     the queue would sit idle until the next offline → online flip)
    //   - the PWA comes back to the foreground (tab switch / app resume)
    const retry = () => syncPending();
    window.addEventListener("online", retry);
    window.addEventListener(QUEUE_CHANGED_EVENT, retry);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") syncPending();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener(QUEUE_CHANGED_EVENT, retry);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncPending]);
}
