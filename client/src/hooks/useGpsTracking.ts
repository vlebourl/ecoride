import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { haversineDistance } from "@/lib/haversine";
import { useWakeLock } from "./useWakeLock";
import type { GpsPoint } from "@ecoride/shared/types";

const MAX_ACCURACY_M = 50;
const MIN_DISTANCE_KM = 0.005; // 5m
const BACKUP_KEY = "ecoride-tracking-backup";
const SESSION_KEY = "ecoride-trip-session";
const BACKUP_INTERVAL_MS = 30_000;
const MAX_TIMEOUT_RETRIES = 3;
const TIMEOUT_RETRY_DELAY_MS = 3_000;

export interface TrackingState {
  isTracking: boolean;
  isPaused: boolean;
  distanceKm: number;
  durationSec: number;
  gpsPoints: GpsPoint[];
  error: string | null;
  lastAccuracy: number | null;
  speedKmh: number | null;
  heading: number | null;
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

export interface UseGpsTrackingResult {
  state: TrackingState;
  start: () => void;
  stop: () => TrackingSession;
  reset: () => void;
  restore: (backup: TrackingBackup) => void;
  pause: () => void;
  resume: () => void;
}

type Action =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | {
      type: "GPS_POINT";
      point: GpsPoint;
      accuracy: number;
      speed: number | null;
      heading: number | null;
    }
  | { type: "TICK" }
  | { type: "ERROR"; message: string }
  | { type: "RESTORE"; backup: TrackingBackup };

const initial: TrackingState = {
  isTracking: false,
  isPaused: false,
  distanceKm: 0,
  durationSec: 0,
  gpsPoints: [],
  error: null,
  lastAccuracy: null,
  speedKmh: null,
  heading: null,
};

function reducer(state: TrackingState, action: Action): TrackingState {
  switch (action.type) {
    case "START":
      return {
        ...initial,
        isTracking: true,
        isPaused: false,
        lastAccuracy: null,
        speedKmh: null,
        heading: null,
      };
    case "STOP":
      return { ...state, isTracking: false, isPaused: false };
    case "PAUSE":
      // Preserve all accumulated data; GPS watch and timer stop via the effect.
      return { ...state, isPaused: true, error: null };
    case "RESUME":
      // GPS watch and timer restart via the effect when isPaused flips to false.
      return { ...state, isPaused: false, error: null };
    case "GPS_POINT": {
      const points = [...state.gpsPoints, action.point];
      let added = 0;
      if (state.gpsPoints.length > 0) {
        const prev = state.gpsPoints[state.gpsPoints.length - 1]!;
        const d = haversineDistance(prev.lat, prev.lng, action.point.lat, action.point.lng);
        if (d >= MIN_DISTANCE_KM) added = d;
      }
      const speedKmh = action.speed != null ? action.speed * 3.6 : state.speedKmh;
      const heading =
        action.heading != null && speedKmh != null && speedKmh > 1.8
          ? action.heading
          : state.heading;
      return {
        ...state,
        gpsPoints: points,
        distanceKm: state.distanceKm + added,
        error: null,
        lastAccuracy: action.accuracy,
        speedKmh,
        heading,
      };
    }
    case "TICK":
      return { ...state, durationSec: state.durationSec + 1 };
    case "ERROR":
      // Clear heading on GPS loss so the map reverts to north-up
      // instead of staying rotated to a stale direction.
      return { ...state, error: action.message, heading: null };
    case "RESTORE":
      return {
        isTracking: true,
        isPaused: false,
        gpsPoints: action.backup.gpsPoints,
        distanceKm: action.backup.distanceKm,
        durationSec: action.backup.durationSec,
        error: null,
        lastAccuracy: null,
        speedKmh: null,
        heading: null,
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

/**
 * Read the active trip session key from sessionStorage.
 * Present when a trip is in progress within this browser tab session.
 * Cleared on normal stop/reset; absent after tab close or app crash.
 */
export function getTrackingSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
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
    if (!s.isTracking || !startRef.current || s.gpsPoints.length === 0) return;
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
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
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

    // Clear any stale backup from a previous unresolved trip so it cannot be
    // offered as the "current" trip if the user navigates away before the
    // next backup interval fires (fixes ECO-19 / GitHub #146).
    clearTrackingBackup();

    dispatch({ type: "START" });
    const startedAt = new Date().toISOString();
    startRef.current = startedAt;
    retryCountRef.current = 0;

    // Mark the session as active so TripPage can distinguish "navigated away
    // while tracking" from "app crashed / tab closed" on remount.
    try {
      sessionStorage.setItem(SESSION_KEY, startedAt);
    } catch {
      // sessionStorage unavailable — graceful degradation
    }
  }, []);

  // Separate effect: flush backup immediately when app goes to background (ECO-22).
  // MUST be a separate effect — GPS effect dependency array must stay [state.isTracking] per CLAUDE.md.
  useEffect(() => {
    if (!state.isTracking) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveBackup();
      } else {
        // Foreground return — re-acquire wake lock
        wakeLock.request();
      }
    };

    const handlePageHide = () => saveBackup();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isTracking, saveBackup]);

  // Start/stop GPS watch, timer, wake lock, and backup based on isTracking+isPaused state.
  // Runs when either flag changes:
  //   isTracking true + isPaused false  → start GPS watch, timer, backup
  //   isPaused becomes true             → cleanup (watch+timer stop; distance/duration frozen)
  //   isPaused becomes false (resume)   → restart watch+timer from current accumulated state
  //   isTracking becomes false          → cleanup

  useEffect(() => {
    if (!state.isTracking || state.isPaused) return;

    retryCountRef.current = 0; // Reset retry counter on (re)start / resume
    wakeLock.request();

    // GPS watch
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > MAX_ACCURACY_M) return;
        retryCountRef.current = 0;
        dispatch({
          type: "GPS_POINT",
          point: { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: pos.timestamp },
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
        });
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: "Permission GPS refusée",
          2: "Position non disponible",
          3: "Timeout GPS",
        };
        dispatch({ type: "ERROR", message: msgs[err.code] ?? "Erreur GPS" });
        if (err.code === 1 || err.code === 2) wakeLock.release();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    // Timer — only ticks when active (not paused), so durationSec reflects active time only.
    const timer = setInterval(() => dispatch({ type: "TICK" }), 1000);

    // Backup
    const backupTimer = setInterval(saveBackup, BACKUP_INTERVAL_MS);

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      clearInterval(timer);
      clearInterval(backupTimer);
      wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isTracking, state.isPaused]);

  /** Restore tracking from a backup (called externally by TripPage). */
  const restore = useCallback((backup: TrackingBackup) => {
    if (!("geolocation" in navigator)) {
      dispatch({ type: "ERROR", message: "Geolocation not supported" });
      return;
    }

    startRef.current = backup.startedAt;
    retryCountRef.current = 0;

    // Re-mark the session so subsequent navigations still auto-restore.
    try {
      sessionStorage.setItem(SESSION_KEY, backup.startedAt);
    } catch {
      // sessionStorage unavailable — graceful degradation
    }

    // Dispatch RESTORE first so isTracking becomes true, then the isTracking
    // useEffect below handles GPS watch + timer setup (single source of truth).
    // Previously restore() started its own GPS/timers which caused double-tick.
    dispatch({ type: "RESTORE", backup });
    clearTrackingBackup();
  }, []);

  /** Pause the trip — GPS watch and timer stop; accumulated data is preserved. */
  const pause = useCallback(() => {
    // Flush backup immediately so data isn't lost if the browser kills the tab while paused.
    saveBackup();
    dispatch({ type: "PAUSE" });
  }, [saveBackup]);

  /** Resume after a pause — GPS watch and timer restart via the effect. */
  const resume = useCallback(() => {
    dispatch({ type: "RESUME" });
  }, []);

  const stop = useCallback((): TrackingSession => {
    cleanup();
    dispatch({ type: "STOP" });
    wakeLock.release();
    clearTrackingBackup(); // Fix 1.3: Clear backup on normal stop
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }

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
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }, [cleanup, wakeLock]);

  // Cleanup is now handled by the isTracking/isPaused effect above

  return { state, start, stop, reset, restore, pause, resume };
}

const GpsTrackingContext = createContext<UseGpsTrackingResult | null>(null);

export function GpsTrackingProvider({ children }: { children: ReactNode }) {
  const gps = useGpsTracking();
  return createElement(GpsTrackingContext.Provider, { value: gps }, children);
}

export function useAppGpsTracking(): UseGpsTrackingResult {
  const gps = useContext(GpsTrackingContext);
  if (!gps) throw new Error("useAppGpsTracking must be used within GpsTrackingProvider");
  return gps;
}
