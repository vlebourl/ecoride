import { useState, useEffect, useRef } from "react";
import { getTrackingBackup, clearTrackingBackup, getTrackingSession } from "@/hooks/useGpsTracking";
import type { TrackingSession, TrackingBackup, UseGpsTrackingResult } from "@/hooks/useGpsTracking";

type TripState = "idle" | "tracking" | "stopped" | "manual";

export interface UseSessionRecoveryOptions {
  gps: UseGpsTrackingResult;
}

export interface UseSessionRecoveryResult {
  pendingBackup: TrackingBackup | null;
  setPendingBackup: (b: TrackingBackup | null) => void;
  sessionPersistFailed: boolean;
  setSessionPersistFailed: (v: boolean) => void;
  sessionRef: React.MutableRefObject<TrackingSession | null>;
  /** Non-null on mount when an existing session/backup was detected. */
  initialUiState: TripState | null;
  handleRestore: (resetMapState: () => void) => void;
  handleDismissBackup: () => void;
}

/**
 * Manages session recovery on mount: checks sessionStorage for a stopped session
 * and localStorage for a tracking backup. Returns state + handlers for TripPage.
 */
export function useSessionRecovery({ gps }: UseSessionRecoveryOptions): UseSessionRecoveryResult {
  const [pendingBackup, setPendingBackup] = useState<TrackingBackup | null>(null);
  const [sessionPersistFailed, setSessionPersistFailed] = useState(false);
  const sessionRef = useRef<TrackingSession | null>(null);
  const [initialUiState, setInitialUiState] = useState<TripState | null>(null);

  // On mount: check for an active trip backup.
  useEffect(() => {
    // Restore an unsaved trip that survived navigation (data-loss guard).
    const stoppedRaw = sessionStorage.getItem("ecoride-stopped-session");
    if (stoppedRaw) {
      try {
        const session = JSON.parse(stoppedRaw) as TrackingSession;
        sessionRef.current = session;
        setInitialUiState("stopped");
      } catch {
        sessionStorage.removeItem("ecoride-stopped-session");
      }
      return;
    }
    if (gps.state.isTracking) {
      setInitialUiState("tracking");
      return;
    }
    const backup = getTrackingBackup();
    if (!backup) return;
    const sessionStartedAt = getTrackingSession();
    if (sessionStartedAt && sessionStartedAt === backup.startedAt) {
      // User navigated away mid-trip — restore silently
      gps.restore(backup);
      setInitialUiState("tracking");
    } else {
      // Crash recovery — ask the user whether to resume
      setPendingBackup(backup);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = (resetMapState: () => void) => {
    if (!pendingBackup) return;
    resetMapState();
    gps.restore(pendingBackup);
    setPendingBackup(null);
  };

  const handleDismissBackup = () => {
    clearTrackingBackup();
    setPendingBackup(null);
  };

  return {
    pendingBackup,
    setPendingBackup,
    sessionPersistFailed,
    setSessionPersistFailed,
    sessionRef,
    initialUiState,
    handleRestore,
    handleDismissBackup,
  };
}
