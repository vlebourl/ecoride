import { hasPendingTrips } from "@/lib/offline-queue";
import { hasStoppedSession } from "@/lib/stopped-session";

const TRACKING_BACKUP_KEY = "ecoride-tracking-backup";
const TRACKING_SESSION_KEY = "ecoride-trip-session";

export function hasBlockingTripDataForUpdate(): boolean {
  return (
    !!sessionStorage.getItem(TRACKING_SESSION_KEY) ||
    !!localStorage.getItem(TRACKING_BACKUP_KEY) ||
    hasStoppedSession() ||
    hasPendingTrips()
  );
}
