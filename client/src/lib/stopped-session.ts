import type { TrackingSession } from "@/hooks/useGpsTracking";

const STOPPED_SESSION_KEY = "ecoride-stopped-session";

function parseStoppedSession(raw: string | null): TrackingSession | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrackingSession;
  } catch {
    return null;
  }
}

export function getStoppedSession(): TrackingSession | null {
  const stored = parseStoppedSession(localStorage.getItem(STOPPED_SESSION_KEY));
  if (stored) return stored;

  // Legacy versions persisted the stopped session in sessionStorage only.
  const legacy = parseStoppedSession(sessionStorage.getItem(STOPPED_SESSION_KEY));
  if (!legacy) return null;

  try {
    localStorage.setItem(STOPPED_SESSION_KEY, JSON.stringify(legacy));
  } catch {
    // Keep returning the legacy value even if persistence upgrade fails.
  }
  return legacy;
}

export function setStoppedSession(session: TrackingSession): boolean {
  try {
    localStorage.setItem(STOPPED_SESSION_KEY, JSON.stringify(session));
    sessionStorage.removeItem(STOPPED_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearStoppedSession(): void {
  localStorage.removeItem(STOPPED_SESSION_KEY);
  sessionStorage.removeItem(STOPPED_SESSION_KEY);
}

export function hasStoppedSession(): boolean {
  return getStoppedSession() !== null;
}
