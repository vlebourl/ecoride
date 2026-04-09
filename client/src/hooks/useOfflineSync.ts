import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { getPendingTrips, recordRejectedTrip, removePendingTrip } from "@/lib/offline-queue";
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

  const syncPending = useCallback(async () => {
    const pending = getPendingTrips();
    if (pending.length === 0) return;

    let queueChanged = false;

    // Process from last to first so that removing by index stays valid
    for (let i = pending.length - 1; i >= 0; i--) {
      const trip = pending[i]!;

      try {
        await apiFetch<{ ok: boolean; data: { trip: Trip } }>("/trips", {
          method: "POST",
          body: JSON.stringify(trip),
        });
        removePendingTrip(i);
        queueChanged = true;
      } catch (error) {
        if (isTerminalTripSyncError(error)) {
          recordRejectedTrip(trip, {
            status: error.status,
            reason: getTerminalReason(error),
          });
          removePendingTrip(i);
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
  }, [queryClient]);

  useEffect(() => {
    // Try on mount
    syncPending();

    // Try when coming back online
    const handleOnline = () => syncPending();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncPending]);
}
