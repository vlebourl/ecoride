import { useEffect, useRef } from "react";
import { getTrackingSession, useAppGpsTracking } from "@/hooks/useGpsTracking";
import { useSuper73 } from "@/hooks/useSuper73";
import { pauseOdometerRecording, recordOdometerReading } from "@/lib/trip-odometer";

/**
 * Feeds the bike's odometer to the trip distance rule (lib/trip-odometer.ts)
 * while a trip is counting. Mounted with the Super73 provider, not the trip
 * page, so it keeps recording when the rider opens another screen mid-trip.
 */
export function TripOdometerRecorder() {
  const { odometerKm } = useSuper73();
  const gps = useAppGpsTracking();
  const active = gps.state.isTracking && !gps.state.isPaused;
  const gpsKmRef = useRef(0);

  useEffect(() => {
    gpsKmRef.current = gps.state.distanceKm;
  });

  useEffect(() => {
    const tripId = active ? getTrackingSession() : null;
    if (tripId && odometerKm !== null) {
      recordOdometerReading(tripId, odometerKm, gpsKmRef.current);
    }
  }, [active, odometerKm]);

  // Pause or stop: whatever the bike does next is not part of the trip.
  useEffect(() => (active ? pauseOdometerRecording : undefined), [active]);

  return null;
}
