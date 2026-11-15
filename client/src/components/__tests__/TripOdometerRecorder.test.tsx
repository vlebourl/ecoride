import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { TripOdometerRecorder } from "../TripOdometerRecorder";
import { correctedTripDistance, resetTripOdometer } from "@/lib/trip-odometer";

vi.mock("@/lib/ble-log", () => ({ bleLog: vi.fn() }));

const TRIP = "2026-11-15T08:00:00.000Z";
const bike = { odometerKm: null as number | null };
const gps = { isTracking: false, isPaused: false, distanceKm: 0 };
let session: string | null = null;

vi.mock("@/hooks/useSuper73", () => ({ useSuper73: () => bike }));
vi.mock("@/hooks/useGpsTracking", () => ({
  useAppGpsTracking: () => ({ state: gps }),
  getTrackingSession: () => session,
}));

describe("TripOdometerRecorder", () => {
  let rerender: () => void;
  /** One render per change, like the app: a reading or a GPS fix at a time. */
  const step = (change: Partial<typeof gps> & { odometerKm?: number | null }) => {
    const { odometerKm, ...gpsChange } = change;
    if (odometerKm !== undefined) bike.odometerKm = odometerKm;
    Object.assign(gps, gpsChange);
    rerender();
  };

  beforeEach(() => {
    resetTripOdometer();
    bike.odometerKm = null;
    Object.assign(gps, { isTracking: false, isPaused: false, distanceKm: 0 });
    session = null;
    const view = render(<TripOdometerRecorder />);
    rerender = () => view.rerender(<TripOdometerRecorder />);
  });

  it("pairs each odometer step with the GPS distance at that moment", () => {
    session = TRIP;
    step({ isTracking: true, odometerKm: 100.0 });
    step({ distanceKm: 0.1 });
    step({ odometerKm: 100.1 });
    step({ distanceKm: 3.4 });
    step({ odometerKm: 103.1 });
    step({ distanceKm: 3.5 });
    // 0.1 before the first step + 3.0 by the odometer + 0.1 after the last one.
    expect(correctedTripDistance(TRIP, 3.5)).toBe(3.2);
  });

  it("records nothing when no trip is running", () => {
    step({ odometerKm: 100.0 });
    step({ odometerKm: 100.1 });
    step({ odometerKm: 103.1, distanceKm: 3.3 });
    expect(correctedTripDistance(TRIP, 3.3)).toBe(3.3);
  });

  it("does not count what the bike does while the trip is paused", () => {
    session = TRIP;
    step({ isTracking: true, odometerKm: 100.0 });
    step({ odometerKm: 100.1, distanceKm: 0.1 });
    step({ odometerKm: 102.6, distanceKm: 2.8 });
    step({ isPaused: true });
    step({ odometerKm: 106.6 }); // 4 km while paused
    step({ isPaused: false });
    step({ odometerKm: 106.7, distanceKm: 2.9 });
    step({ odometerKm: 109.1, distanceKm: 5.4 });
    // 2.5 + 2.4 by the odometer, 0.1 + 0.1 by GPS around the pause.
    expect(correctedTripDistance(TRIP, 5.4)).toBe(5.1);
  });

  it("starts a segment when the bike connects mid-trip", () => {
    session = TRIP;
    step({ isTracking: true });
    step({ distanceKm: 2.0 });
    step({ odometerKm: 100.0 });
    step({ odometerKm: 100.1, distanceKm: 2.1 });
    step({ odometerKm: 103.1, distanceKm: 5.3 });
    expect(correctedTripDistance(TRIP, 5.3)).toBe(5.1);
  });

  it("carries on across a Bluetooth drop", () => {
    session = TRIP;
    step({ isTracking: true, odometerKm: 100.0 });
    step({ odometerKm: 100.1, distanceKm: 0.1 });
    step({ odometerKm: null }); // link lost
    step({ distanceKm: 2.6 });
    step({ odometerKm: 103.1, distanceKm: 2.7 }); // back, 3 km later
    expect(correctedTripDistance(TRIP, 2.7)).toBe(3.1);
  });
});
