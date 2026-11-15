// Trip distance from the Super73 odometer, with GPS as the reference.
//
// The bike's odometer (v1 record 0202) counts wheel turns in 100 m steps: it does
// not drift between buildings and it keeps counting in a tunnel. The rule, for a
// GPS-tracked trip:
//
// 1. Every odometer reading is paired with the GPS distance at that moment.
// 2. A segment runs from one observed odometer step to a later one. The step is
//    the only moment the 100 m counter is exact, so a segment is a whole number
//    of steps and its ends are off only by how late the step was seen: a few
//    metres by notification, up to the poll interval otherwise. The exception is
//    a reading that reveals several steps at once (the first one after a lost
//    link): it can be up to 100 m late, until the next step replaces it.
// 3. Pausing or stopping closes the segment; the first step after a resume opens
//    a new one. Distance ridden during a pause is never counted.
// 4. A lost Bluetooth link does not close the segment: the odometer is absolute,
//    so the next reading still covers what was ridden meanwhile.
// 5. A segment replaces its GPS distance by its odometer distance only when
//    - it is at least MIN_ODOMETER_SEGMENT_KM long (see the constant), and
//    - the two sources agree within MIN/MAX_ODOMETER_TO_GPS_RATIO.
//    Otherwise the segment keeps its GPS distance.
// 6. Everything outside a segment keeps its GPS distance: the trip before the
//    bike connected, before the first step, after the last one, and any bike
//    whose odometer is not decoded (protocol v2).
//
// When in doubt the GPS distance stands.

import { bleLog } from "@/lib/ble-log";

/**
 * A segment that ends on a late reading (rule 2) is short by up to one 100 m
 * step: 5 % of 2 km. Usual error is well under that.
 */
export const MIN_ODOMETER_SEGMENT_KM = 2;
/**
 * Below this, the phone travelled well beyond what the wheel turned (walked away
 * from the bike, bike carried): not a measurement error, so GPS stands. GPS jitter
 * between buildings overcounts by less than this.
 */
export const MIN_ODOMETER_TO_GPS_RATIO = 0.8;
/**
 * Above this, GPS missed a third of the segment or more. That happens for real
 * (app in the background for a long stretch), but so does a bike ridden without
 * the phone, and the two look the same from here — so GPS stands. Tunnels stay
 * well under it: the GPS tracker already counts the straight line across a gap.
 */
export const MAX_ODOMETER_TO_GPS_RATIO = 1.5;

interface Sample {
  odometerKm: number;
  gpsKm: number;
}

/** Distance covered between two odometer steps, by each source. */
export interface OdometerSegment {
  odometerKm: number;
  gpsKm: number;
}

export interface OdometerTrack {
  tripId: string;
  /** Last reading since the trip started or resumed; a higher one is a step. */
  lastKm: number | null;
  open: { from: Sample; to: Sample } | null;
  segments: OdometerSegment[];
}

export function newOdometerTrack(tripId: string): OdometerTrack {
  return { tripId, lastKm: null, open: null, segments: [] };
}

// Readings are tenths of a km stored as floats: 1366.3 - 1363.9 is 2.3999….
const tenths = (km: number) => Math.round(km * 10) / 10;

export function addOdometerReading(
  track: OdometerTrack,
  odometerKm: number,
  gpsKm: number,
): OdometerTrack {
  const { lastKm } = track;
  if (lastKm === null) return { ...track, lastKm: odometerKm };
  if (odometerKm === lastKm) return track;
  // Going backwards is another bike or a reset counter: keep what was measured
  // so far and start over from this reading.
  if (odometerKm < lastKm) return { ...closeOdometerSegment(track), lastKm: odometerKm };
  const to = { odometerKm, gpsKm };
  return { ...track, lastKm: odometerKm, open: { from: track.open?.from ?? to, to } };
}

/** Pause or stop: end the current segment at its last observed step. */
export function closeOdometerSegment(track: OdometerTrack): OdometerTrack {
  const { open } = track;
  const segments = open
    ? [
        ...track.segments,
        {
          odometerKm: tenths(open.to.odometerKm - open.from.odometerKm),
          gpsKm: open.to.gpsKm - open.from.gpsKm,
        },
      ]
    : track.segments;
  return { ...track, lastKm: null, open: null, segments };
}

export function segmentUsesOdometer({ odometerKm, gpsKm }: OdometerSegment): boolean {
  return (
    odometerKm >= MIN_ODOMETER_SEGMENT_KM &&
    odometerKm >= gpsKm * MIN_ODOMETER_TO_GPS_RATIO &&
    odometerKm <= gpsKm * MAX_ODOMETER_TO_GPS_RATIO
  );
}

export interface TripDistance {
  distanceKm: number;
  /** Part of distanceKm measured by the odometer; 0 means GPS only. */
  odometerKm: number;
}

export function resolveTripDistance(track: OdometerTrack | null, gpsKm: number): TripDistance {
  let distanceKm = gpsKm;
  let odometerKm = 0;
  for (const segment of track ? closeOdometerSegment(track).segments : []) {
    if (!segmentUsesOdometer(segment)) continue;
    distanceKm += segment.odometerKm - segment.gpsKm;
    odometerKm += segment.odometerKm;
  }
  return { distanceKm: Math.round(distanceKm * 1000) / 1000, odometerKm: tenths(odometerKm) };
}

// ---- Current trip ----
//
// ponytail: kept in memory, so a reload mid-trip loses the segments recorded so
// far and that part of the trip stays on GPS. Persist it next to the tracking
// backup if restored trips turn out to matter.
let current: OdometerTrack | null = null;

/** `tripId` is the trip's startedAt, so a track can never leak into another trip. */
export function recordOdometerReading(tripId: string, odometerKm: number, gpsKm: number): void {
  const track = current?.tripId === tripId ? current : newOdometerTrack(tripId);
  current = addOdometerReading(track, odometerKm, gpsKm);
}

export function pauseOdometerRecording(): void {
  if (current) current = closeOdometerSegment(current);
}

/** Distance to save for a stopped trip. Logged so a correction can be traced afterwards. */
export function correctedTripDistance(tripId: string, gpsKm: number): number {
  const track = current?.tripId === tripId ? current : null;
  const { distanceKm, odometerKm } = resolveTripDistance(track, gpsKm);
  if (track) {
    const segments = closeOdometerSegment(track).segments;
    bleLog(
      "trip_distance",
      `gps ${gpsKm.toFixed(3)} km, saved ${distanceKm.toFixed(3)} km, odometer part ${odometerKm} km, segments ${JSON.stringify(
        segments.map((s) => [s.odometerKm, Math.round(s.gpsKm * 1000) / 1000]),
      )}`,
    );
  }
  return distanceKm;
}

export function resetTripOdometer(): void {
  current = null;
}
