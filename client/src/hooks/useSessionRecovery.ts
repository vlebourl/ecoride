import { useCallback, useEffect, useRef, useState } from "react";
import { getTrackingBackup, clearTrackingBackup, getTrackingSession } from "@/hooks/useGpsTracking";
import { getStoppedSession } from "@/lib/stopped-session";
import type { TrackingSession, TrackingBackup, UseGpsTrackingResult } from "@/hooks/useGpsTracking";

type TripState = "idle" | "tracking" | "stopped" | "manual";

interface RecoveryBootstrap {
  initialUiState: TripState | null;
  initialSession: TrackingSession | null;
  initialPendingBackup: TrackingBackup | null;
  restoreBackup: TrackingBackup | null;
}

function getRecoveryBootstrap(isTracking: boolean): RecoveryBootstrap {
  const session = getStoppedSession();
  if (session) {
    return {
      initialUiState: "stopped",
      initialSession: session,
      initialPendingBackup: null,
      restoreBackup: null,
    };
  }

  if (isTracking) {
    return {
      initialUiState: "tracking",
      initialSession: null,
      initialPendingBackup: null,
      restoreBackup: null,
    };
  }

  const backup = getTrackingBackup();
  if (!backup) {
    return {
      initialUiState: null,
      initialSession: null,
      initialPendingBackup: null,
      restoreBackup: null,
    };
  }

  const sessionStartedAt = getTrackingSession();
  if (sessionStartedAt && sessionStartedAt === backup.startedAt) {
    return {
      initialUiState: "tracking",
      initialSession: null,
      initialPendingBackup: null,
      restoreBackup: backup,
    };
  }

  return {
    initialUiState: null,
    initialSession: null,
    initialPendingBackup: backup,
    restoreBackup: null,
  };
}

export interface UseSessionRecoveryOptions {
  gps: UseGpsTrackingResult;
}

export interface UseSessionRecoveryResult {
  pendingBackup: TrackingBackup | null;
  setPendingBackup: (b: TrackingBackup | null) => void;
  sessionPersistFailed: boolean;
  setSessionPersistFailed: (v: boolean) => void;
  sessionRef: React.MutableRefObject<TrackingSession | null>;
  setSession: (session: TrackingSession | null) => void;
  clearSession: () => void;
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
  const [bootstrap] = useState<RecoveryBootstrap>(() => getRecoveryBootstrap(gps.state.isTracking));
  const [pendingBackup, setPendingBackup] = useState<TrackingBackup | null>(
    bootstrap.initialPendingBackup,
  );
  const [sessionPersistFailed, setSessionPersistFailed] = useState(false);
  const sessionRef = useRef<TrackingSession | null>(bootstrap.initialSession);
  const restoredBackupRef = useRef(false);

  useEffect(() => {
    if (!bootstrap.restoreBackup || restoredBackupRef.current) return;
    restoredBackupRef.current = true;
    gps.restore(bootstrap.restoreBackup);
  }, [gps, bootstrap.restoreBackup]);

  const setSession = useCallback((session: TrackingSession | null) => {
    sessionRef.current = session;
  }, []);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
  }, []);

  const handleRestore = useCallback(
    (resetMapState: () => void) => {
      if (!pendingBackup) return;
      resetMapState();
      gps.restore(pendingBackup);
      setPendingBackup(null);
    },
    [gps, pendingBackup],
  );

  const handleDismissBackup = useCallback(() => {
    clearTrackingBackup();
    setPendingBackup(null);
  }, []);

  return {
    pendingBackup,
    setPendingBackup,
    sessionPersistFailed,
    setSessionPersistFailed,
    sessionRef,
    setSession,
    clearSession,
    initialUiState: bootstrap.initialUiState,
    handleRestore,
    handleDismissBackup,
  };
}
