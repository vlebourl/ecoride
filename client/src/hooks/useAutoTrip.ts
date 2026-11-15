import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { getTrackingBackup, useAppGpsTracking } from "@/hooks/useGpsTracking";
import { useSuper73 } from "@/hooks/useSuper73";
import {
  INITIAL_AUTO_TRIP_STATE,
  isAutoTripEnabled,
  stepAutoTrip,
  type AutoTripEnd,
} from "@/lib/auto-trip";
import { hasStoppedSession } from "@/lib/stopped-session";

const TICK_MS = 1_000;
const TRIP_PATH = "/trip";

interface AutoTripHandlers {
  start: () => void;
  stop: (end: AutoTripEnd) => void;
}

// The trip screen owns starting, stopping and saving a trip. It registers its
// handlers here while mounted; when it is not, the controller opens it and the
// next tick finds them.
let handlers: AutoTripHandlers | null = null;

export function useAutoTripHandlers(start: () => void, stop: (end: AutoTripEnd) => void): void {
  useEffect(() => {
    const mine = { start, stop };
    handlers = mine;
    return () => {
      if (handlers === mine) handlers = null;
    };
  }, [start, stop]);
}

/** Runs the auto-trip decision once per second for the whole app. Renders nothing. */
export function AutoTripController(): null {
  const ble = useSuper73();
  const gps = useAppGpsTracking();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const latest = useRef({ ble, gps, navigate, pathname });
  useEffect(() => {
    latest.current = { ble, gps, navigate, pathname };
  });

  useEffect(() => {
    let state = INITIAL_AUTO_TRIP_STATE;
    const tick = () => {
      if (!isAutoTripEnabled()) {
        state = INITIAL_AUTO_TRIP_STATE;
        return;
      }
      const { ble, gps, navigate, pathname } = latest.current;
      const result = stepAutoTrip(
        state,
        {
          connected: ble.status === "connected",
          bikeSpeedKmh: ble.bikeSpeedKmh,
          isTracking: gps.state.isTracking,
          isPaused: gps.state.isPaused,
          distanceKm: gps.state.distanceKm,
          durationSec: gps.state.durationSec,
        },
        Date.now(),
      );
      state = result.state;
      const action = result.action;
      if (!action) return;

      // Starting a trip clears the recovery copies of the previous one. Never
      // do that behind the rider's back while one is still waiting to be saved
      // or restored.
      if (action.type === "start" && (hasStoppedSession() || getTrackingBackup() !== null)) {
        // Not requested after all: a trip the rider then restores is theirs.
        state = { ...state, requested: null };
        return;
      }

      if (!handlers) {
        if (pathname !== TRIP_PATH) navigate(TRIP_PATH);
        return;
      }
      if (action.type === "start") handlers.start();
      else handlers.stop(action.end);
    };
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
