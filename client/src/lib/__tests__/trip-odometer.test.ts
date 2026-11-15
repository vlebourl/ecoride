import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ODOMETER_TO_GPS_RATIO,
  MIN_ODOMETER_SEGMENT_KM,
  MIN_ODOMETER_TO_GPS_RATIO,
  addOdometerReading,
  closeOdometerSegment,
  correctedTripDistance,
  isOdometerDistanceEnabled,
  newOdometerTrack,
  pauseOdometerRecording,
  recordOdometerReading,
  resetTripOdometer,
  resolveTripDistance,
  segmentUsesOdometer,
  setOdometerDistanceEnabled,
  type OdometerTrack,
} from "../trip-odometer";

vi.mock("@/lib/ble-log", () => ({ bleLog: vi.fn() }));

// Node's own experimental localStorage shadows jsdom's and is unusable here.
function stubSetting(enabled: boolean) {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (enabled && key === "ecoride-odometer-distance" ? "1" : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  });
}

/** Feed [odometerKm, gpsKm] readings in order. */
function ride(readings: [number, number][], track = newOdometerTrack("trip")): OdometerTrack {
  return readings.reduce(
    (t, [odometerKm, gpsKm]) => addOdometerReading(t, odometerKm, gpsKm),
    track,
  );
}

describe("segmentUsesOdometer", () => {
  it("uses the odometer when the segment is long enough and the sources agree", () => {
    expect(segmentUsesOdometer({ odometerKm: 5, gpsKm: 4.7 })).toBe(true);
  });

  it("keeps GPS below the minimum length: 100 m of resolution is too much of a short ride", () => {
    expect(segmentUsesOdometer({ odometerKm: MIN_ODOMETER_SEGMENT_KM, gpsKm: 2 })).toBe(true);
    expect(segmentUsesOdometer({ odometerKm: MIN_ODOMETER_SEGMENT_KM - 0.1, gpsKm: 1.9 })).toBe(
      false,
    );
  });

  it("keeps GPS when the wheel turned far less than the phone travelled", () => {
    expect(segmentUsesOdometer({ odometerKm: 4, gpsKm: 4 / MIN_ODOMETER_TO_GPS_RATIO })).toBe(true);
    expect(segmentUsesOdometer({ odometerKm: 4, gpsKm: 5.1 })).toBe(false);
  });

  it("keeps GPS when the odometer is implausibly far above it", () => {
    expect(segmentUsesOdometer({ odometerKm: 4 * MAX_ODOMETER_TO_GPS_RATIO, gpsKm: 4 })).toBe(true);
    expect(segmentUsesOdometer({ odometerKm: 6.1, gpsKm: 4 })).toBe(false);
  });

  it("keeps GPS when GPS saw no movement at all", () => {
    expect(segmentUsesOdometer({ odometerKm: 3, gpsKm: 0 })).toBe(false);
  });
});

describe("trip distance", () => {
  it("is the GPS distance when no odometer was recorded", () => {
    expect(resolveTripDistance(null, 3.217)).toEqual({ distanceKm: 3.217, odometerKm: 0 });
    expect(resolveTripDistance(newOdometerTrack("trip"), 3.217)).toEqual({
      distanceKm: 3.217,
      odometerKm: 0,
    });
  });

  it("replaces the GPS distance between the first and last odometer step", () => {
    // Connected from the start. GPS drifts between buildings: 5.4 km measured
    // where the wheel did 5.0 between the two steps.
    const track = ride([
      [1363.9, 0],
      [1364.0, 0.06], // first step: the segment starts here
      [1366.5, 2.8],
      [1369.0, 5.46], // last step
    ]);
    // 0.06 before the first step + 5.0 by the odometer + 0.04 after the last one.
    expect(resolveTripDistance(track, 5.5)).toEqual({ distanceKm: 5.1, odometerKm: 5 });
  });

  it("does not count a first reading as a step: the 100 m counter is only exact when it moves", () => {
    // Two readings 100 m apart on the counter can be 1 m or 199 m apart on the road.
    const track = ride([
      [1363.9, 0],
      [1363.9, 1.2],
    ]);
    expect(track.open).toBeNull();
    expect(resolveTripDistance(track, 1.2)).toEqual({ distanceKm: 1.2, odometerKm: 0 });
  });

  it("keeps GPS for a short trip", () => {
    const track = ride([
      [1363.9, 0],
      [1364.0, 0.05],
      [1365.2, 1.4],
    ]);
    expect(resolveTripDistance(track, 1.45)).toEqual({ distanceKm: 1.45, odometerKm: 0 });
  });

  it("keeps GPS before the bike connected", () => {
    // 2 km ridden before the first reading, then 3 km covered by the odometer.
    const track = ride([
      [1370.0, 2.0],
      [1370.1, 2.08],
      [1373.1, 5.3],
    ]);
    // 2.08 by GPS + 3.0 by the odometer (GPS said 3.22) + nothing after.
    expect(resolveTripDistance(track, 5.3)).toEqual({ distanceKm: 5.08, odometerKm: 3 });
  });

  it("covers a Bluetooth drop: the odometer is absolute", () => {
    // No reading between 1364.0 and 1367.0 — the link was down for 3 km, part of
    // it in a tunnel where GPS only saw 2.6 km.
    const track = ride([
      [1363.9, 0],
      [1364.0, 0.1],
      [1367.0, 2.7],
      [1367.1, 2.8],
    ]);
    expect(resolveTripDistance(track, 2.85)).toEqual({ distanceKm: 3.25, odometerKm: 3.1 });
  });

  it("keeps GPS after the bike is lost for good", () => {
    const track = ride([
      [1363.9, 0],
      [1364.0, 0.1],
      [1366.5, 2.7],
    ]);
    // The trip went on for 4 km without the bike: only GPS knows.
    expect(resolveTripDistance(track, 6.7)).toEqual({ distanceKm: 6.6, odometerKm: 2.5 });
  });

  it("never counts what the bike did during a pause", () => {
    let track = ride([
      [1363.9, 0],
      [1364.0, 0.1],
      [1366.5, 2.7],
    ]);
    track = closeOdometerSegment(track); // pause at GPS 2.75
    // The bike moved 4 km while paused. The first reading after the resume is a
    // starting point, not a step.
    track = ride(
      [
        [1370.5, 2.75],
        [1370.6, 2.8],
        [1373.0, 5.3],
      ],
      track,
    );
    expect(track.segments).toEqual([{ odometerKm: 2.5, gpsKm: expect.closeTo(2.6, 6) }]);
    // 2.5 + 2.4 by the odometer; 0.1 + 0.05 + 0.05 + 0 by GPS around the steps.
    expect(resolveTripDistance(track, 5.3)).toEqual({ distanceKm: 5.1, odometerKm: 4.9 });
  });

  it("judges each segment on its own", () => {
    let track = ride([
      [100.0, 0],
      [100.1, 0.1],
      [103.1, 3.2], // 3.0 vs 3.1 by GPS: used
    ]);
    track = closeOdometerSegment(track);
    track = ride(
      [
        [103.1, 3.2],
        [103.2, 3.3],
        [104.2, 4.4], // 1.0 km: too short, stays on GPS
      ],
      track,
    );
    expect(resolveTripDistance(track, 4.4)).toEqual({ distanceKm: 4.3, odometerKm: 3 });
  });

  it("keeps GPS when the phone left without the bike", () => {
    // The wheel did 2 km while the phone travelled 9: walked on, or took a train.
    const track = ride([
      [100.0, 0],
      [100.1, 0.1],
      [102.1, 9.1],
    ]);
    expect(resolveTripDistance(track, 9.1)).toEqual({ distanceKm: 9.1, odometerKm: 0 });
  });

  it("keeps GPS when the odometer jumps far beyond it", () => {
    const track = ride([
      [100.0, 0],
      [100.1, 0.1],
      [140.1, 3.1],
    ]);
    expect(resolveTripDistance(track, 3.1)).toEqual({ distanceKm: 3.1, odometerKm: 0 });
  });

  it("starts over when the odometer goes backwards, keeping what was measured", () => {
    const track = ride([
      [100.0, 0],
      [100.1, 0.1],
      [103.1, 3.2],
      [20.0, 3.3], // another bike
      [20.1, 3.4],
      [20.5, 3.8],
    ]);
    expect(track.segments).toEqual([{ odometerKm: 3, gpsKm: expect.closeTo(3.1, 6) }]);
    expect(resolveTripDistance(track, 3.8)).toEqual({ distanceKm: 3.7, odometerKm: 3 });
  });

  it("stores whole steps despite float readings", () => {
    const track = closeOdometerSegment(
      ride([
        [1363.9, 0],
        [1364.0, 0],
        [1366.3, 2.3],
      ]),
    );
    expect(track.segments[0]!.odometerKm).toBe(2.3);
  });
});

describe("setting", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is off by default and remembers the choice", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
    expect(isOdometerDistanceEnabled()).toBe(false);
    setOdometerDistanceEnabled(true);
    expect(isOdometerDistanceEnabled()).toBe(true);
    setOdometerDistanceEnabled(false);
    expect(isOdometerDistanceEnabled()).toBe(false);
  });

  it("is off when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => setOdometerDistanceEnabled(true)).not.toThrow();
    expect(isOdometerDistanceEnabled()).toBe(false);
  });

  it("off, a recorded trip keeps its GPS distance", () => {
    resetTripOdometer();
    stubSetting(false);
    recordOdometerReading("2026-11-15T08:00:00.000Z", 100.0, 0);
    recordOdometerReading("2026-11-15T08:00:00.000Z", 100.1, 0.1);
    recordOdometerReading("2026-11-15T08:00:00.000Z", 103.1, 3.3);
    expect(correctedTripDistance("2026-11-15T08:00:00.000Z", 3.4)).toBe(3.4);
  });
});

describe("current trip", () => {
  beforeEach(() => {
    resetTripOdometer();
    stubSetting(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  const recordRide = (tripId: string) => {
    recordOdometerReading(tripId, 100.0, 0);
    recordOdometerReading(tripId, 100.1, 0.1);
    recordOdometerReading(tripId, 103.1, 3.3);
  };

  it("corrects the distance of the trip it recorded", () => {
    recordRide("2026-11-15T08:00:00.000Z");
    expect(correctedTripDistance("2026-11-15T08:00:00.000Z", 3.4)).toBe(3.2);
    // Asking twice gives the same answer: a retry must resend the same distance.
    expect(correctedTripDistance("2026-11-15T08:00:00.000Z", 3.4)).toBe(3.2);
  });

  it("leaves another trip's distance alone", () => {
    recordRide("2026-11-15T08:00:00.000Z");
    expect(correctedTripDistance("2026-11-15T18:00:00.000Z", 3.4)).toBe(3.4);
  });

  it("starts from nothing when a new trip begins", () => {
    recordRide("2026-11-15T08:00:00.000Z");
    recordOdometerReading("2026-11-15T18:00:00.000Z", 103.5, 0);
    expect(correctedTripDistance("2026-11-15T18:00:00.000Z", 1)).toBe(1);
    expect(correctedTripDistance("2026-11-15T08:00:00.000Z", 3.4)).toBe(3.4);
  });

  it("closes the segment on pause", () => {
    const tripId = "2026-11-15T08:00:00.000Z";
    recordRide(tripId);
    pauseOdometerRecording();
    recordOdometerReading(tripId, 110.0, 3.4); // moved while paused
    recordOdometerReading(tripId, 110.1, 3.5);
    expect(correctedTripDistance(tripId, 3.5)).toBe(3.3);
  });

  it("ignores a pause when nothing was recorded", () => {
    expect(() => pauseOdometerRecording()).not.toThrow();
  });
});
