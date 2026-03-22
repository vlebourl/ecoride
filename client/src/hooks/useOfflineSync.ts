import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getPendingTrips, removePendingTrip } from "@/lib/offline-queue";
import type { Trip } from "@ecoride/shared/types";

export function useOfflineSync() {
  const queryClient = useQueryClient();

  const syncPending = useCallback(async () => {
    const pending = getPendingTrips();
    if (pending.length === 0) return;

    // Process from last to first so that removing by index stays valid
    for (let i = pending.length - 1; i >= 0; i--) {
      try {
        await apiFetch<{ ok: boolean; data: { trip: Trip } }>("/trips", {
          method: "POST",
          body: JSON.stringify(pending[i]),
        });
        removePendingTrip(i);
      } catch {
        // Keep in queue, will retry next time
      }
    }

    // If at least one succeeded, invalidate queries
    if (getPendingTrips().length < pending.length) {
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
