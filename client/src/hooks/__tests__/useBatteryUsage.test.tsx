import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBatteryRecorder, useLearnedRange } from "../useBatteryUsage";
import { loadBatteryRecords, saveBatteryRecord, tripConsumption } from "@/lib/battery-usage";

const STARTED_AT = "2026-11-15T08:00:00.000Z";

const mocks = vi.hoisted(() => ({
  gps: { isTracking: false, isPaused: false, distanceKm: 0 },
  ble: { status: "disconnected", rangeKm: null as number | null },
  session: null as string | null,
}));

vi.mock("@/hooks/useGpsTracking", () => ({
  useAppGpsTracking: () => ({ state: mocks.gps }),
  getTrackingSession: () => mocks.session,
}));
vi.mock("@/hooks/useSuper73", () => ({ useSuper73: () => mocks.ble }));

describe("useBatteryRecorder", () => {
  let rerender: () => void;

  /** Apply a change to the mocked GPS/bike state and let the recorder see it. */
  function step(change: {
    km?: number;
    range?: number | null;
    connected?: boolean;
    paused?: boolean;
    tracking?: boolean;
  }) {
    if (change.km !== undefined) mocks.gps.distanceKm = change.km;
    if (change.paused !== undefined) mocks.gps.isPaused = change.paused;
    if (change.tracking !== undefined) mocks.gps.isTracking = change.tracking;
    if (change.connected !== undefined) {
      mocks.ble.status = change.connected ? "connected" : "disconnected";
      // useSuper73 clears the reading when the bike drops.
      if (!change.connected) mocks.ble.rangeKm = null;
    }
    if (change.range !== undefined) mocks.ble.rangeKm = change.range;
    rerender();
  }

  beforeEach(() => {
    localStorage.clear();
    Object.assign(mocks.gps, { isTracking: true, isPaused: false, distanceKm: 0 });
    Object.assign(mocks.ble, { status: "connected", rangeKm: null });
    mocks.session = STARTED_AT;
    rerender = renderHook(() => useBatteryRecorder()).rerender;
  });

  it("records the reading at the start and at the end of a trip", () => {
    step({ range: 57 });
    step({ km: 2.4, range: 55 });
    step({ km: 5.2, range: 51 });

    const [record] = loadBatteryRecords();
    expect(record).toMatchObject({ startedAt: STARTED_AT, startRangeKm: 57, endRangeKm: 51 });
    expect(tripConsumption(record!)).toMatchObject({ dropKm: 6, measuredKm: 5.2 });
  });

  it("records nothing when the bike never connects", () => {
    step({ connected: false });
    step({ km: 6 });
    expect(loadBatteryRecords()).toEqual([]);
  });

  it("records nothing while the bike is connected but has not reported a range yet", () => {
    step({ km: 3 });
    expect(loadBatteryRecords()).toEqual([]);
  });

  it("measures from the point where the bike connected when it connects mid-ride", () => {
    step({ connected: false });
    step({ km: 3 });
    step({ connected: true, range: 40 });
    step({ km: 7, range: 36 });

    expect(tripConsumption(loadBatteryRecords()[0]!)).toMatchObject({ dropKm: 4, measuredKm: 4 });
  });

  it("keeps the last reading taken before the bike dropped, not the trip's end", () => {
    step({ range: 50 });
    step({ km: 4, range: 46 });
    step({ connected: false });
    step({ km: 9 });

    expect(loadBatteryRecords()[0]).toMatchObject({ endRangeKm: 46, endDistanceKm: 4 });
  });

  it("carries on with the same trip when the bike reconnects", () => {
    step({ range: 50 });
    step({ km: 4, range: 46 });
    step({ connected: false });
    step({ km: 6 });
    step({ connected: true, range: 44 });
    step({ km: 9, range: 41 });

    expect(loadBatteryRecords()).toHaveLength(1);
    expect(tripConsumption(loadBatteryRecords()[0]!)).toMatchObject({ dropKm: 9, measuredKm: 9 });
  });

  it("does not read a stale range across a reconnection", () => {
    step({ range: 30 });
    step({ km: 2 });
    // Battery swapped while disconnected: nothing is recorded until the bike reports again.
    step({ connected: false });
    step({ connected: true });
    step({ km: 3 });
    expect(loadBatteryRecords()[0]).toMatchObject({ endRangeKm: 30, endDistanceKm: 2 });
  });

  it("takes a final reading at the exact distance when the trip is paused to stop it", () => {
    step({ range: 50 });
    step({ km: 5.21, range: 45 });
    step({ km: 5.28 }); // same 100 m step: no new sample
    expect(loadBatteryRecords()[0]!.endDistanceKm).toBe(5.21);
    step({ paused: true });
    expect(loadBatteryRecords()[0]!.endDistanceKm).toBe(5.28);
  });

  it("records nothing outside a tracked trip", () => {
    step({ tracking: false, range: 57 });
    step({ km: 3, range: 54 });
    expect(loadBatteryRecords()).toEqual([]);
  });

  it("records nothing when the trip has no session key", () => {
    mocks.session = null;
    step({ range: 57 });
    expect(loadBatteryRecords()).toEqual([]);
  });

  it("keeps trips apart by their start time", () => {
    step({ range: 57 });
    step({ km: 5, range: 52 });
    mocks.session = "2026-11-15T18:00:00.000Z";
    step({ km: 0 });
    step({ km: 3, range: 49 });

    expect(loadBatteryRecords().map((r) => [r.startRangeKm, r.endRangeKm])).toEqual([
      [57, 52],
      [52, 49],
    ]);
  });
});

describe("useLearnedRange", () => {
  beforeEach(() => localStorage.clear());

  const save = (startedAt: string, start: number, end: number, km: number) =>
    saveBatteryRecord({
      startedAt,
      startRangeKm: start,
      startDistanceKm: 0,
      endRangeKm: end,
      endDistanceKm: km,
      minRangeKm: end,
      recharged: false,
    });

  it("is empty before any trip", () => {
    expect(renderHook(() => useLearnedRange()).result.current.fullRangeKm).toBeNull();
  });

  it("learns from the trips stored on this device", () => {
    save("a", 50, 40, 8);
    save("b", 40, 30, 8);
    save("c", 30, 20, 8);
    expect(renderHook(() => useLearnedRange()).result.current.fullRangeKm).toBeCloseTo(48);
  });
});
