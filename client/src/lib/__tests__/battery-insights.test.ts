import { describe, expect, it } from "vitest";
import {
  applySample,
  compareModes,
  rangeByMonth,
  type BatteryTripRecord,
} from "@/lib/battery-usage";

/** One trip: `km` ridden, `drop` displayed km lost, `raceShare` of it in race. */
function trip(startedAt: string, km: number, drop: number, raceShare: number): BatteryTripRecord {
  return {
    startedAt,
    startRangeKm: 50,
    startDistanceKm: 0,
    endRangeKm: 50 - drop,
    endDistanceKm: km,
    minRangeKm: 50 - drop,
    recharged: false,
    raceKm: km * raceShare,
    lastRace: raceShare > 0.5,
  };
}

describe("applySample — race distance (#423)", () => {
  it("credits each step to the mode of the reading that opened it", () => {
    let r = applySample(undefined, "t", { rangeKm: 40, distanceKm: 0, race: false });
    r = applySample(r, "t", { rangeKm: 39, distanceKm: 2, race: true }); // 2 km eco
    r = applySample(r, "t", { rangeKm: 37, distanceKm: 5, race: false }); // 3 km race
    r = applySample(r, "t", { rangeKm: 36, distanceKm: 6, race: false }); // 1 km eco
    expect(r?.raceKm).toBe(3);
  });

  it("leaves records saved before #423 without a race distance", () => {
    const legacy = { ...trip("t", 5, 2, 0), raceKm: undefined, lastRace: undefined };
    expect(applySample(legacy, "t", { rangeKm: 47, distanceKm: 6, race: true })?.raceKm).toBe(
      undefined,
    );
  });
});

describe("compareModes (#423)", () => {
  it("compares displayed km lost per km in race and in the other modes", () => {
    const records = [
      trip("2026-11-01", 10, 4, 0), // 0.4 /km
      trip("2026-11-02", 10, 4, 0.1),
      trip("2026-11-03", 10, 6, 1), // 0.6 /km
      trip("2026-11-04", 10, 6, 0.9),
      trip("2026-11-05", 10, 9, 0.5), // mixed: ignored
    ];
    const result = compareModes(records);
    expect(result?.ecoPerKm).toBeCloseTo(0.4);
    expect(result?.racePerKm).toBeCloseTo(0.6);
    expect(result?.extraPercent).toBeCloseTo(50);
  });

  it("stays null until both modes have enough trips", () => {
    expect(compareModes([trip("a", 10, 4, 0), trip("b", 10, 4, 0), trip("c", 10, 6, 1)])).toBe(
      null,
    );
  });
});

describe("rangeByMonth (#423)", () => {
  it("learns a full-charge range per month with enough trips", () => {
    const records = [
      // October: 30 km for 30 displayed km → 60 km full range.
      ...[1, 2, 3].map((d) => trip(`2026-10-0${d}T08:00:00Z`, 10, 10, 0)),
      // November: 24 km for 30 → 48 km.
      ...[1, 2, 3].map((d) => trip(`2026-11-0${d}T08:00:00Z`, 8, 10, 0)),
      // December: one trip, not enough.
      trip("2026-12-01T08:00:00Z", 10, 10, 0),
    ];
    expect(rangeByMonth(records)).toEqual([
      { month: "2026-10", fullRangeKm: 60 },
      { month: "2026-11", fullRangeKm: 48 },
    ]);
  });
});
