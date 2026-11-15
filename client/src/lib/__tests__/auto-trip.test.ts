import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_TRIP_CONFIG,
  INITIAL_AUTO_TRIP_STATE,
  endSessionAtLastMovement,
  isAutoTripEnabled,
  isAutoTripWorthSaving,
  setAutoTripEnabled,
  stepAutoTrip,
  type AutoTripAction,
  type AutoTripInput,
} from "../auto-trip";
import type { TrackingSession } from "@/hooks/useGpsTracking";

const SEC = 1_000;
const MIN = 60 * SEC;
const T0 = 1_700_000_000_000;

const IDLE: AutoTripInput = {
  connected: true,
  bikeSpeedKmh: 0,
  isTracking: false,
  isPaused: false,
  distanceKm: 0,
  durationSec: 0,
};

/** Feeds the engine one sample per second, like the controller does. */
function simulate() {
  let state = INITIAL_AUTO_TRIP_STATE;
  let now = T0;
  const tick = (input: Partial<AutoTripInput>, advanceMs = SEC): AutoTripAction => {
    now += advanceMs;
    const result = stepAutoTrip(state, { ...IDLE, ...input }, now);
    state = result.state;
    return result.action;
  };
  return {
    tick,
    /** Holds the same input for `ms`, returns every action emitted. */
    hold(input: Partial<AutoTripInput>, ms: number): AutoTripAction[] {
      const actions: AutoTripAction[] = [];
      for (let elapsed = 0; elapsed < ms; elapsed += SEC) actions.push(tick(input));
      return actions;
    },
    now: () => now,
  };
}

const RIDING = { isTracking: true, bikeSpeedKmh: 22 };

/** Brings a simulation to "auto-started trip, bike riding". */
function startedRide() {
  const sim = simulate();
  sim.hold({ bikeSpeedKmh: 22 }, 6 * SEC);
  sim.hold({ ...RIDING, distanceKm: 1.5, durationSec: 240 }, 10 * SEC);
  return sim;
}

describe("auto-trip start", () => {
  it("starts once the bike has held the start speed for the hold time", () => {
    const sim = simulate();
    // First sample opens the window; the hold is counted from it.
    expect(sim.hold({ bikeSpeedKmh: 12 }, 5 * SEC).every((a) => a === null)).toBe(true);
    expect(sim.tick({ bikeSpeedKmh: 12 })).toEqual({ type: "start" });
  });

  it("keeps asking to start until tracking begins", () => {
    const sim = simulate();
    sim.hold({ bikeSpeedKmh: 12 }, 5 * SEC);
    expect(sim.tick({ bikeSpeedKmh: 12 })).toEqual({ type: "start" });
    expect(sim.tick({ bikeSpeedKmh: 12 })).toEqual({ type: "start" });
    expect(sim.tick({ ...RIDING })).toBeNull();
  });

  it("never starts for a bike switched on and standing still", () => {
    const sim = simulate();
    expect(sim.hold({ bikeSpeedKmh: 0 }, 10 * MIN).every((a) => a === null)).toBe(true);
  });

  it("never starts for a bike pushed by hand", () => {
    const sim = simulate();
    expect(sim.hold({ bikeSpeedKmh: 6 }, 10 * MIN).every((a) => a === null)).toBe(true);
  });

  it("restarts the hold when the speed dips below the start speed", () => {
    const sim = simulate();
    sim.hold({ bikeSpeedKmh: 12 }, 4 * SEC);
    sim.tick({ bikeSpeedKmh: 5 });
    expect(sim.hold({ bikeSpeedKmh: 12 }, 5 * SEC).every((a) => a === null)).toBe(true);
    expect(sim.tick({ bikeSpeedKmh: 12 })).toEqual({ type: "start" });
  });

  it("ignores a speed left over from a link that is down", () => {
    const sim = simulate();
    const actions = sim.hold({ connected: false, bikeSpeedKmh: 25 }, MIN);
    expect(actions.every((a) => a === null)).toBe(true);
  });

  it("ignores a missing or invalid speed", () => {
    const sim = simulate();
    expect(sim.hold({ bikeSpeedKmh: null }, MIN).every((a) => a === null)).toBe(true);
    expect(sim.hold({ bikeSpeedKmh: Number.NaN }, MIN).every((a) => a === null)).toBe(true);
  });

  it("does not count time the app did not observe toward the hold", () => {
    const sim = simulate();
    sim.tick({ bikeSpeedKmh: 12 });
    // WebView suspended for a minute: two fast samples do not prove a minute of riding.
    expect(sim.tick({ bikeSpeedKmh: 12 }, MIN)).toBeNull();
    // Inputs are ignored while the stale state settles, then the hold starts over.
    const settle = sim.hold({ bikeSpeedKmh: 12 }, AUTO_TRIP_CONFIG.settleMs);
    expect(settle.every((a) => a === null)).toBe(true);
    expect(sim.hold({ bikeSpeedKmh: 12 }, 4 * SEC).every((a) => a === null)).toBe(true);
    expect(sim.tick({ bikeSpeedKmh: 12 })).toEqual({ type: "start" });
  });

  it("does not restart a trip the rider abandoned until the bike has come to rest", () => {
    const sim = startedRide();
    // Rider abandons while still riding.
    const stillRiding = sim.hold({ bikeSpeedKmh: 22 }, 2 * MIN);
    expect(stillRiding.every((a) => a === null)).toBe(true);
    // A stop, then a fresh departure: a new trip may begin.
    sim.tick({ bikeSpeedKmh: 0 });
    sim.hold({ bikeSpeedKmh: 22 }, 5 * SEC);
    expect(sim.tick({ bikeSpeedKmh: 22 })).toEqual({ type: "start" });
  });

  it("can start again right after a trip it ended itself", () => {
    const sim = startedRide();
    sim.hold({ isTracking: true, bikeSpeedKmh: 0 }, AUTO_TRIP_CONFIG.stopAfterMs);
    sim.tick({ bikeSpeedKmh: 22 });
    sim.hold({ bikeSpeedKmh: 22 }, 4 * SEC);
    expect(sim.tick({ bikeSpeedKmh: 22 })).toEqual({ type: "start" });
  });
});

describe("auto-trip stop", () => {
  it("does not stop at a red light", () => {
    const sim = startedRide();
    const actions = sim.hold({ isTracking: true, bikeSpeedKmh: 0 }, 3 * MIN);
    expect(actions.every((a) => a === null)).toBe(true);
    // Riding again resets the countdown.
    sim.tick({ ...RIDING });
    expect(sim.hold({ isTracking: true, bikeSpeedKmh: 0 }, 3 * MIN).every((a) => a === null)).toBe(
      true,
    );
  });

  it("stops after the bike stood still for the stop delay, ending at the last movement", () => {
    const sim = startedRide();
    sim.tick({ ...RIDING, distanceKm: 4.2, durationSec: 600 });
    const lastMovementAt = sim.now();
    // Duration and GPS distance keep running while the bike is parked.
    const parked = { isTracking: true, bikeSpeedKmh: 0, distanceKm: 4.25, durationSec: 900 };
    const actions = sim.hold(parked, AUTO_TRIP_CONFIG.stopAfterMs);
    expect(actions.slice(0, -1).every((a) => a === null)).toBe(true);
    expect(actions.at(-1)).toEqual({
      type: "stop",
      end: { at: lastMovementAt, distanceKm: 4.2, durationSec: 600, autoStarted: true },
    });
    // Level-triggered: repeated until tracking actually stops.
    expect(sim.tick(parked)?.type).toBe("stop");
  });

  it("survives a Bluetooth drop shorter than the stop delay", () => {
    const sim = startedRide();
    const dropped = { isTracking: true, connected: false, bikeSpeedKmh: null };
    expect(sim.hold(dropped, 4 * MIN).every((a) => a === null)).toBe(true);
    sim.tick({ ...RIDING });
    expect(sim.hold(dropped, 4 * MIN).every((a) => a === null)).toBe(true);
  });

  it("stops when the bike stays disconnected, ending when it was last seen moving", () => {
    const sim = startedRide();
    sim.tick({ ...RIDING, distanceKm: 3, durationSec: 500 });
    const lastMovementAt = sim.now();
    const off = { isTracking: true, connected: false, bikeSpeedKmh: null, distanceKm: 9 };
    const actions = sim.hold(off, AUTO_TRIP_CONFIG.stopAfterMs);
    expect(actions.at(-1)).toEqual({
      type: "stop",
      end: { at: lastMovementAt, distanceKm: 3, durationSec: 500, autoStarted: true },
    });
  });

  it("does not let a creeping speed below the moving threshold keep a trip alive", () => {
    const sim = startedRide();
    const actions = sim.hold({ isTracking: true, bikeSpeedKmh: 2 }, AUTO_TRIP_CONFIG.stopAfterMs);
    expect(actions.at(-1)?.type).toBe("stop");
  });

  it("leaves alone a trip during which the bike was never seen moving", () => {
    const sim = simulate();
    // Started by hand, e.g. on another bike: no Super73 link at all.
    const manual = { isTracking: true, connected: false, bikeSpeedKmh: null };
    expect(sim.hold(manual, 60 * MIN).every((a) => a === null)).toBe(true);
    // Or with the Super73 on, but parked next to the rider.
    expect(sim.hold({ isTracking: true, bikeSpeedKmh: 0 }, 60 * MIN).every((a) => a === null)).toBe(
      true,
    );
  });

  it("flags a trip started by hand so it is not held to the phantom-trip distance", () => {
    const sim = simulate();
    sim.hold({ ...RIDING, distanceKm: 0.05, durationSec: 30 }, 5 * SEC);
    const actions = sim.hold({ isTracking: true, bikeSpeedKmh: 0 }, AUTO_TRIP_CONFIG.stopAfterMs);
    const stop = actions.at(-1);
    expect(stop?.type === "stop" && stop.end.autoStarted).toBe(false);
  });

  it("never stops a trip the rider paused", () => {
    const sim = startedRide();
    const paused = { isTracking: true, isPaused: true, bikeSpeedKmh: 0 };
    expect(sim.hold(paused, 30 * MIN).every((a) => a === null)).toBe(true);
  });

  it("does not trust stale speed after a suspension, and ends the trip where it was last seen", () => {
    const sim = startedRide();
    sim.tick({ ...RIDING, distanceKm: 5, durationSec: 700 });
    const lastMovementAt = sim.now();
    // Phone locked for three hours; React state still says 22 km/h on wake-up.
    const stale = { ...RIDING, distanceKm: 5, durationSec: 700 + 3 * 3600 };
    expect(sim.tick(stale, 180 * MIN)).toBeNull();
    const settle = sim.hold(stale, AUTO_TRIP_CONFIG.settleMs - SEC);
    expect(settle.every((a) => a === null)).toBe(true);
    // Fresh data arrives: the bike is off. The stale samples earned no credit.
    const off = { isTracking: true, connected: false, bikeSpeedKmh: null };
    expect(sim.hold(off, 2 * SEC).at(-1)).toEqual({
      type: "stop",
      end: { at: lastMovementAt, distanceKm: 5, durationSec: 700, autoStarted: true },
    });
  });
});

describe("auto-trip session helpers", () => {
  const session: TrackingSession = {
    distanceKm: 4.4,
    durationSec: 900,
    gpsPoints: [
      { lat: 48.85, lng: 2.35, ts: T0 },
      { lat: 48.86, lng: 2.36, ts: T0 + 10 * MIN },
      { lat: 48.87, lng: 2.37, ts: T0 + 14 * MIN },
    ],
    startedAt: new Date(T0).toISOString(),
    endedAt: new Date(T0 + 15 * MIN).toISOString(),
  };
  const end = { at: T0 + 10 * MIN, distanceKm: 4.2, durationSec: 600, autoStarted: true };

  it("cuts the session back to the last movement", () => {
    expect(endSessionAtLastMovement(session, end)).toEqual({
      ...session,
      distanceKm: 4.2,
      durationSec: 600,
      gpsPoints: session.gpsPoints.slice(0, 2),
      endedAt: new Date(T0 + 10 * MIN).toISOString(),
    });
  });

  it("discards an auto-started trip that went nowhere over GPS", () => {
    // Wheel spun on a stand, or bike rolled out of the garage.
    expect(isAutoTripWorthSaving({ ...session, distanceKm: 0 }, end)).toBe(false);
    expect(isAutoTripWorthSaving({ ...session, distanceKm: 0.19 }, end)).toBe(false);
    expect(isAutoTripWorthSaving({ ...session, distanceKm: 0.2 }, end)).toBe(true);
  });

  it("keeps a short trip the rider started by hand", () => {
    const manualEnd = { ...end, autoStarted: false };
    expect(isAutoTripWorthSaving({ ...session, distanceKm: 0.05 }, manualEnd)).toBe(true);
    expect(isAutoTripWorthSaving({ ...session, distanceKm: 0.005 }, manualEnd)).toBe(false);
  });

  it("discards a trip with no duration, which the server would reject", () => {
    expect(isAutoTripWorthSaving({ ...session, durationSec: 0 }, end)).toBe(false);
  });
});

describe("auto-trip setting", () => {
  // Node's own experimental localStorage shadows jsdom's and is unusable here.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is off by default and remembers the choice", () => {
    expect(isAutoTripEnabled()).toBe(false);
    setAutoTripEnabled(true);
    expect(isAutoTripEnabled()).toBe(true);
    setAutoTripEnabled(false);
    expect(isAutoTripEnabled()).toBe(false);
  });
});
