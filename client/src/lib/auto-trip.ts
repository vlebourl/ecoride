import type { TrackingSession } from "@/hooks/useGpsTracking";

/**
 * Auto start/stop of a trip from the Super73's Bluetooth link.
 *
 * The bike's wheel sensor is the only witness: GPS never starts a trip and
 * never keeps one alive, otherwise a train taken after parking the bike would
 * be saved as a ride. `stepAutoTrip` is pure and runs once per second; it
 * returns the action that should be true *now* (level-triggered), so repeating
 * it until tracking flips is harmless.
 *
 * Rules:
 * - start: bike connected and at `startSpeedKmh` or more for `startHoldMs`,
 *   no trip running, and the bike has been seen at rest since a trip the rider
 *   ended by hand (abandoning mid-ride must not restart 5 s later);
 * - stop: no sign of movement for `stopAfterMs`, whether the bike sits still
 *   or the link is down. A red light or a Bluetooth drop shorter than that
 *   changes nothing. Only trips where the bike was seen moving are stopped, so
 *   a ride started by hand on another bike is left alone;
 * - the trip ends at the last movement, not `stopAfterMs` later: distance,
 *   duration and GPS points recorded after it are dropped;
 * - time the app did not observe (suspended WebView, manual pause) decides
 *   nothing: the start hold restarts and inputs are ignored for `settleMs`,
 *   because the speed held in React state is stale after a suspension.
 */
export const AUTO_TRIP_CONFIG = {
  /** Above a walking pace, so pushing the bike by hand never starts a trip. */
  startSpeedKmh: 8,
  startHoldMs: 5_000,
  /** Below this the bike counts as stopped. */
  movingSpeedKmh: 3,
  stopAfterMs: 5 * 60_000,
  maxTickGapMs: 10_000,
  settleMs: 15_000,
  /** An auto-started trip shorter than this over GPS is discarded, not saved. */
  minAutoTripKm: 0.2,
};

export type AutoTripConfig = typeof AUTO_TRIP_CONFIG;

export interface AutoTripInput {
  connected: boolean;
  bikeSpeedKmh: number | null;
  isTracking: boolean;
  isPaused: boolean;
  distanceKm: number;
  durationSec: number;
}

/** Where the trip really ended: the last tick the bike was seen moving. */
export interface AutoTripEnd {
  at: number;
  distanceKm: number;
  durationSec: number;
  autoStarted: boolean;
}

export type AutoTripAction = { type: "start" } | { type: "stop"; end: AutoTripEnd } | null;

export interface AutoTripState {
  lastTickAt: number | null;
  settleUntil: number;
  fastSince: number | null;
  armed: boolean;
  wasTracking: boolean;
  requested: "start" | "stop" | null;
  autoStarted: boolean;
  lastMovement: Omit<AutoTripEnd, "autoStarted"> | null;
}

export const INITIAL_AUTO_TRIP_STATE: AutoTripState = {
  lastTickAt: null,
  settleUntil: 0,
  fastSince: null,
  armed: true,
  wasTracking: false,
  requested: null,
  autoStarted: false,
  lastMovement: null,
};

export function stepAutoTrip(
  prev: AutoTripState,
  input: AutoTripInput,
  now: number,
  config: AutoTripConfig = AUTO_TRIP_CONFIG,
): { state: AutoTripState; action: AutoTripAction } {
  // A paused trip belongs to the rider. Leaving lastTickAt untouched makes the
  // resume look like an unobserved gap, which is what it is.
  if (input.isTracking && input.isPaused) return { state: prev, action: null };

  const state: AutoTripState = { ...prev, lastTickAt: now, requested: null };

  if (prev.lastTickAt !== null && now - prev.lastTickAt > config.maxTickGapMs) {
    state.fastSince = null;
    state.settleUntil = now + config.settleMs;
  }

  if (input.isTracking !== prev.wasTracking) {
    state.wasTracking = input.isTracking;
    state.lastMovement = null;
    state.autoStarted = input.isTracking && prev.requested === "start";
    // A trip this module did not end was ended by the rider.
    if (!input.isTracking && prev.requested !== "stop") state.armed = false;
  }

  if (now < state.settleUntil) return { state, action: null };

  const speed = input.connected ? input.bikeSpeedKmh : null;
  const moving = speed !== null && speed >= config.movingSpeedKmh;
  if (!moving) state.armed = true;

  if (input.isTracking) {
    state.fastSince = null;
    if (moving) {
      state.lastMovement = {
        at: now,
        distanceKm: input.distanceKm,
        durationSec: input.durationSec,
      };
    } else if (state.lastMovement && now - state.lastMovement.at >= config.stopAfterMs) {
      state.requested = "stop";
      return {
        state,
        action: { type: "stop", end: { ...state.lastMovement, autoStarted: state.autoStarted } },
      };
    }
    return { state, action: null };
  }

  const fast = speed !== null && speed >= config.startSpeedKmh;
  state.fastSince = fast ? (state.fastSince ?? now) : null;
  if (state.armed && state.fastSince !== null && now - state.fastSince >= config.startHoldMs) {
    state.requested = "start";
    return { state, action: { type: "start" } };
  }
  return { state, action: null };
}

/** Cuts a stopped session back to the last movement the bike reported. */
export function endSessionAtLastMovement(
  session: TrackingSession,
  end: AutoTripEnd,
): TrackingSession {
  return {
    ...session,
    distanceKm: end.distanceKm,
    durationSec: end.durationSec,
    gpsPoints: session.gpsPoints.filter((point) => point.ts <= end.at),
    endedAt: new Date(end.at).toISOString(),
  };
}

/**
 * Whether an auto-stopped trip is worth saving. An auto-started trip needs real
 * GPS displacement: a wheel spun on a stand, or a bike rolled out of a garage,
 * reports speed without going anywhere.
 */
export function isAutoTripWorthSaving(
  session: TrackingSession,
  end: AutoTripEnd,
  config: AutoTripConfig = AUTO_TRIP_CONFIG,
): boolean {
  if (session.durationSec < 1) return false;
  return session.distanceKm >= (end.autoStarted ? config.minAutoTripKm : 0.01);
}

// Kept on the device rather than in the profile: the setting only means
// something on the phone that is paired with the bike, and a profile column
// would need a migration that auto-applies on deploy.
const PREF_KEY = "ecoride-auto-trip";

export function isAutoTripEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoTripEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(PREF_KEY, "1");
    else localStorage.removeItem(PREF_KEY);
  } catch {
    // storage unavailable — the feature stays off
  }
}
