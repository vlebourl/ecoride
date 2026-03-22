import { useCallback, useEffect, useReducer, useRef } from "react";
import { haversineDistance } from "@/lib/haversine";
import { useWakeLock } from "./useWakeLock";
import type { GpsPoint } from "@ecoride/shared/types";

const MAX_ACCURACY_M = 50;
const MIN_DISTANCE_KM = 0.005; // 5m
const BACKUP_KEY = "ecoride-tracking-backup";
const BACKUP_INTERVAL_MS = 30_000;
const MAX_TIMEOUT_RETRIES = 3;
const TIMEOUT_RETRY_DELAY_MS = 3_000;

export interface TrackingState {
  isTracking: boolean;
  distanceKm: number;
  durationSec: number;
  gpsPoints: GpsPoint[];
  error: string | null;
}

export interface TrackingSession {
  distanceKm: number;
  durationSec: number;
  gpsPoints: GpsPoint[];
  startedAt: string;
  endedAt: string;
}

export interface TrackingBackup {
  gpsPoints: GpsPoint[];
  distanceKm: number;
  durationSec: number;
  startedAt: string;
}

type Action =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "GPS_POINT"; point: GpsPoint }
  | { type: "TICK" }
  | { type: "ERROR"; message: string }
  | { type: "RESTORE"; backup: TrackingBackup };

const initial: TrackingState = {
  isTracking: false,
  distanceKm: 0,
  durationSec: 0,
  gpsPoints: [],
  error: null,
};

function reducer(state: TrackingState, action: Action): TrackingState {
  switch (action.type) {
    case "START":
      return { ...initial, isTracking: true };
    case "STOP":
      return { ...state, isTracking: false };
    case "GPS_POINT": {
      const points = [...state.gpsPoints, action.point];
      let added = 0;
      if (state.gpsPoints.length > 0) {
        const prev = state.gpsPoints[state.gpsPoints.length - 1]!;
        const d = haversineDistance(prev.lat, prev.lng, action.point.lat, action.point.lng);
        if (d >= MIN_DISTANCE_KM) added = d;
      }
      return { ...state, gpsPoints: points, distanceKm: state.distanceKm + added, error: null };
    }
    case "TICK":
      return { ...state, durationSec: state.durationSec + 1 };
    case "ERROR":
      return { ...state, error: action.message };
    case "RESTORE":
      return {
        isTracking: true,
        gpsPoints: action.backup.gpsPoints,
        distanceKm: action.backup.distanceKm,
        durationSec: action.backup.durationSec,
        error: null,
      };
  }
}

/** Read a pending tracking backup from localStorage (if any). */
export function getTrackingBackup(): TrackingBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TrackingBackup;
  } catch {
    return null;
  }
}

/** Clear the tracking backup from localStorage. */
export function clearTrackingBackup(): void {
  localStorage.removeItem(BACKUP_KEY);
}

export function useGpsTracking() {
  const [state, dispatch] = useReducer(reducer, initial);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const wakeLock = useWakeLock();

  // Keep stateRef in sync so backup timer reads latest state
  stateRef.current = state;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const clearBackupTimer = useCallback(() => {
    if (backupTimerRef.current !== null) {
      clearInterval(backupTimerRef.current);
      backupTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    clearRetryTimer();
    clearBackupTimer();
  }, [clearRetryTimer, clearBackupTimer]);

  /** Save current tracking state to localStorage. */
  const saveBackup = useCallback(() => {
    const s = stateRef.current;
    if (!s.isTracking || !startRef.current) return;
    try {
      const backup: TrackingBackup = {
        gpsPoints: s.gpsPoints,
        distanceKm: s.distanceKm,
        durationSec: s.durationSec,
        startedAt: startRef.current,
      };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    } catch {
      // localStorage full or unavailable — ignore
    }
  }, []);

  /** Start the GPS watch (used both for initial start and timeout retry). */
  const startWatch = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > MAX_ACCURACY_M) return;
        retryCountRef.current = 0; // Reset retry counter on successful fix
        dispatch({
          type: "GPS_POINT",
          point: { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: pos.timestamp },
        });
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: "Permission GPS refusée",
          2: "Position non disponible",
          3: "Timeout GPS",
        };

        // Fix 1.2: Auto-recovery after GPS timeout (tunnel)
        if (err.code === 3 && retryCountRef.current < MAX_TIMEOUT_RETRIES) {
          retryCountRef.current += 1;
          dispatch({
            type: "ERROR",
            message: `Timeout GPS — nouvelle tentative ${retryCountRef.current}/${MAX_TIMEOUT_RETRIES}...`,
          });
          clearRetryTimer();
          retryTimerRef.current = setTimeout(() => {
            startWatch();
          }, TIMEOUT_RETRY_DELAY_MS);
          return;
        }

        dispatch({ type: "ERROR", message: msgs[err.code] ?? "Erreur GPS" });

        // Fix 1.5: Release wake lock on fatal GPS errors
        if (err.code === 1 || err.code === 2) {
          wakeLock.release();
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, [clearRetryTimer, wakeLock]);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      dispatch({ type: "ERROR", message: "Geolocation not supported" });
      return;
    }

    dispatch({ type: "START" });
    startRef.current = new Date().toISOString();
    retryCountRef.current = 0;
    wakeLock.request();

    startWatch();

    timerRef.current = setInterval(() => dispatch({ type: "TICK" }), 1000);

    // Fix 1.3: Periodic GPS backup to localStorage
    backupTimerRef.current = setInterval(saveBackup, BACKUP_INTERVAL_MS);
  }, [wakeLock, startWatch, saveBackup]);

  /** Restore tracking from a backup (called externally by TripPage). */
  const restore = useCallback(
    (backup: TrackingBackup) => {
      if (!("geolocation" in navigator)) {
        dispatch({ type: "ERROR", message: "Geolocation not supported" });
        return;
      }

      dispatch({ type: "RESTORE", backup });
      startRef.current = backup.startedAt;
      retryCountRef.current = 0;
      wakeLock.request();

      startWatch();

      timerRef.current = setInterval(() => dispatch({ type: "TICK" }), 1000);
      backupTimerRef.current = setInterval(saveBackup, BACKUP_INTERVAL_MS);

      clearTrackingBackup();
    },
    [wakeLock, startWatch, saveBackup],
  );

  const stop = useCallback((): TrackingSession => {
    cleanup();
    dispatch({ type: "STOP" });
    wakeLock.release();
    clearTrackingBackup(); // Fix 1.3: Clear backup on normal stop

    return {
      distanceKm: state.distanceKm,
      durationSec: state.durationSec,
      gpsPoints: state.gpsPoints,
      startedAt: startRef.current ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };
  }, [cleanup, state, wakeLock]);

  const reset = useCallback(() => {
    cleanup();
    wakeLock.release();
    dispatch({ type: "START" });
    dispatch({ type: "STOP" });
    startRef.current = null;
    clearTrackingBackup();
  }, [cleanup, wakeLock]);

  // Fix 1.4: Release wake lock on component unmount
  useEffect(() => {
    return () => {
      cleanup();
      wakeLock.release();
    };
  }, [cleanup, wakeLock]);

  return { state, start, stop, reset, restore };
}
