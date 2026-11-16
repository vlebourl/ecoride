import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRidePacket, SUPER73_BASE_MAX_RANGE } from "@/lib/super73-ble";
import {
  DISPLAYED_FULL_RANGE_KM,
  applySample,
  findBatteryRecord,
  learnRange,
  learnedRemainingKm,
  loadBatteryRecords,
  saveBatteryRecord,
  tripConsumption,
  type BatteryTripRecord,
} from "@/lib/battery-usage";

/** A trip measured from its first metre: `start` → `end` km of displayed range over `km`. */
function trip(start: number, end: number, km: number, startedAt = "t"): BatteryTripRecord {
  const first = applySample(undefined, startedAt, { rangeKm: start, distanceKm: 0 })!;
  return applySample(first, startedAt, { rangeKm: end, distanceKm: km })!;
}

describe("the bike's range estimate", () => {
  it("decodes the frame captured on a real v1 bike as 57 km — what its RANGE screen showed", () => {
    const frame = Uint8Array.from([0x02, 0x03, 0, 0, 0, 0, 0, 0, 0x39, 0]);
    // 95 % is derived (57 ÷ 60): the bike sends no state of charge.
    expect(parseRidePacket(frame)).toEqual({ rangeKm: 57, batteryPercent: 95 });
  });

  it("uses the same full-charge figure as the BLE layer", () => {
    expect(DISPLAYED_FULL_RANGE_KM).toBe(SUPER73_BASE_MAX_RANGE);
  });
});

describe("applySample", () => {
  it("keeps the first reading as the start and the latest as the end", () => {
    let record = applySample(undefined, "t", { rangeKm: 57, distanceKm: 0 });
    record = applySample(record, "t", { rangeKm: 55, distanceKm: 2.1 });
    record = applySample(record, "t", { rangeKm: 51, distanceKm: 5.2 });
    expect(record).toEqual({
      startedAt: "t",
      startRangeKm: 57,
      startDistanceKm: 0,
      endRangeKm: 51,
      endDistanceKm: 5.2,
      minRangeKm: 51,
      recharged: false,
      raceKm: 0,
      lastRace: false,
    });
  });

  it("starts from where the bike connected when it connects late", () => {
    const record = applySample(undefined, "t", { rangeKm: 40, distanceKm: 3.2 });
    expect(record).toMatchObject({ startRangeKm: 40, startDistanceKm: 3.2 });
  });

  it("does not start on a capped reading: 60 means '60 or more'", () => {
    expect(applySample(undefined, "t", { rangeKm: 60, distanceKm: 0 })).toBeUndefined();
    const record = applySample(undefined, "t", { rangeKm: 59, distanceKm: 0.8 });
    expect(record).toMatchObject({ startRangeKm: 59, startDistanceKm: 0.8 });
  });

  it("flags a recharge when a reading climbs 5 km above the lowest one seen", () => {
    let record = trip(40, 35, 4);
    record = applySample(record, "t", { rangeKm: 40, distanceKm: 4 })!;
    expect(record.recharged).toBe(true);
    // The flag stays even if the range then drops again.
    expect(applySample(record, "t", { rangeKm: 30, distanceKm: 9 })!.recharged).toBe(true);
  });

  it("does not take a small rebound of the estimate for a recharge", () => {
    const record = applySample(trip(40, 35, 4), "t", { rangeKm: 37, distanceKm: 4.5 })!;
    expect(record.recharged).toBe(false);
  });

  it("ignores a reading that is not a number", () => {
    const record = trip(40, 35, 4);
    expect(applySample(record, "t", { rangeKm: NaN, distanceKm: 5 })).toBe(record);
    expect(applySample(undefined, "t", { rangeKm: 40, distanceKm: NaN })).toBeUndefined();
  });
});

describe("tripConsumption", () => {
  it("reports the drop, its derived percent and the ratio per km ridden", () => {
    const usage = tripConsumption(trip(57, 51, 5.2))!;
    expect(usage).toMatchObject({ startRangeKm: 57, endRangeKm: 51, dropKm: 6, measuredKm: 5.2 });
    expect(usage.dropPercent).toBeCloseTo(10); // 6 ÷ 60
    expect(usage.dropPerKm).toBeCloseTo(6 / 5.2);
  });

  it("measures only the stretch between the two readings", () => {
    let record = applySample(undefined, "t", { rangeKm: 40, distanceKm: 3 });
    record = applySample(record, "t", { rangeKm: 36, distanceKm: 7 });
    expect(tripConsumption(record!)).toMatchObject({ dropKm: 4, measuredKm: 4, dropPerKm: 1 });
  });

  it("gives no value with a single reading", () => {
    const record = applySample(undefined, "t", { rangeKm: 50, distanceKm: 2 })!;
    expect(tripConsumption(record)).toBeNull();
  });

  it("gives no value when the readings are less than 1 km apart", () => {
    expect(tripConsumption(trip(50, 49, 0.9))).toBeNull();
    expect(tripConsumption(trip(50, 49, 1))).not.toBeNull();
  });

  it("gives no value when the battery was recharged during the trip", () => {
    const record = applySample(trip(40, 35, 4), "t", { rangeKm: 58, distanceKm: 8 })!;
    expect(tripConsumption(record)).toBeNull();
  });

  it("gives no value when the trip distance went backwards (restored from an older backup)", () => {
    let record = applySample(undefined, "t", { rangeKm: 50, distanceKm: 6 });
    record = applySample(record, "t", { rangeKm: 48, distanceKm: 4 });
    expect(tripConsumption(record!)).toBeNull();
  });

  it("reports an estimate that rose as it is, without clamping it to zero", () => {
    expect(tripConsumption(trip(50, 51, 2))).toMatchObject({ dropKm: -1 });
  });
});

describe("learnRange", () => {
  const enough = [trip(57, 45, 10), trip(45, 39, 5), trip(39, 29, 8)]; // 23 km for 28 displayed

  it("learns 60 × km ridden ÷ km of displayed range lost", () => {
    const learned = learnRange(enough);
    expect(learned.tripCount).toBe(3);
    expect(learned.dropKm).toBe(28);
    expect(learned.kmPerDisplayedKm).toBeCloseTo(23 / 28);
    expect(learned.fullRangeKm).toBeCloseTo((60 * 23) / 28); // ≈ 49 km
  });

  it("shows nothing before three counted trips", () => {
    const learned = learnRange([trip(57, 37, 18), trip(37, 17, 18)]);
    expect(learned).toEqual({
      fullRangeKm: null,
      kmPerDisplayedKm: null,
      tripCount: 2,
      dropKm: 40,
    });
  });

  it("shows nothing before 20 km of displayed range were used, however many trips", () => {
    const learned = learnRange([
      trip(57, 52, 4),
      trip(52, 47, 4),
      trip(47, 42, 4),
      trip(42, 38, 4),
    ]);
    expect(learned).toMatchObject({ fullRangeKm: null, tripCount: 4, dropKm: 19 });
  });

  it("shows nothing with no trips at all", () => {
    expect(learnRange([])).toEqual({
      fullRangeKm: null,
      kmPerDisplayedKm: null,
      tripCount: 0,
      dropKm: 0,
    });
  });

  it("weighs trips by distance: whole-km rounding on short trips cancels out", () => {
    // Real ratio 1:1. The two short trips read 1 and 3 instead of 2 and 2; a
    // mean of per-trip ratios would give (1 + 1 + 2 + 0.67) / 4 = 1.17.
    const learned = learnRange([
      trip(50, 40, 10),
      trip(40, 30, 10),
      trip(30, 29, 2),
      trip(29, 26, 2),
    ]);
    expect(learned.fullRangeKm).toBeCloseTo(60);
  });

  it("counts a short trip on which the estimate did not move", () => {
    // Dropping it would keep only the trips where rounding went the other way.
    const learned = learnRange([...enough, trip(29, 29, 2)]);
    expect(learned.tripCount).toBe(4);
    expect(learned.kmPerDisplayedKm).toBeCloseTo(25 / 28);
  });

  it("leaves out a trip with a recharge", () => {
    const recharged = applySample(trip(40, 20, 15), "t", { rangeKm: 58, distanceKm: 30 })!;
    expect(learnRange([...enough, recharged])).toEqual(learnRange(enough));
  });

  it("leaves out a reading stuck over a long trip", () => {
    // 20 km without the estimate moving: a frozen record, or a ride without assistance.
    expect(learnRange([...enough, trip(50, 50, 20)])).toEqual(learnRange(enough));
  });

  it("leaves out a drop no ride can explain", () => {
    // 30 displayed km gone in 2 km: GPS lost most of the distance.
    expect(learnRange([...enough, trip(55, 25, 2)])).toEqual(learnRange(enough));
  });

  it("leaves out trips too short to measure", () => {
    expect(learnRange([...enough, trip(29, 28, 0.5)])).toEqual(learnRange(enough));
  });

  it("only looks at the 20 most recent counted trips", () => {
    const old = Array.from({ length: 5 }, () => trip(50, 30, 10)); // 0.5 km per displayed km
    const recent = Array.from({ length: 20 }, () => trip(50, 40, 10)); // 1 km per displayed km
    const learned = learnRange([...old, ...recent]);
    expect(learned.tripCount).toBe(20);
    expect(learned.fullRangeKm).toBeCloseTo(60);
  });
});

describe("learnedRemainingKm", () => {
  it("rescales the bike's current estimate", () => {
    const learned = learnRange([trip(50, 40, 8), trip(40, 30, 8), trip(30, 20, 8)]);
    expect(learnedRemainingKm(50, learned)).toBeCloseTo(40);
  });

  it("is null without a reading or before the range is learned", () => {
    expect(learnedRemainingKm(null, learnRange([trip(50, 40, 8)]))).toBeNull();
    expect(learnedRemainingKm(50, learnRange([]))).toBeNull();
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a record and replaces it on the next reading of the same trip", () => {
    saveBatteryRecord(trip(57, 55, 2, "2026-11-15T08:00:00.000Z"));
    saveBatteryRecord(trip(57, 51, 5.2, "2026-11-15T08:00:00.000Z"));
    saveBatteryRecord(trip(51, 48, 3, "2026-11-15T18:00:00.000Z"));
    expect(loadBatteryRecords().map((r) => [r.startedAt, r.endRangeKm])).toEqual([
      ["2026-11-15T08:00:00.000Z", 51],
      ["2026-11-15T18:00:00.000Z", 48],
    ]);
  });

  it("finds a trip by its instant, whatever the ISO spelling the server returns", () => {
    saveBatteryRecord(trip(57, 51, 5.2, "2026-11-15T08:00:00.000Z"));
    expect(findBatteryRecord("2026-11-15T09:00:00+01:00")?.endRangeKm).toBe(51);
    expect(findBatteryRecord("2026-11-15T08:00:01.000Z")).toBeUndefined();
  });

  it("keeps the 60 most recent trips", () => {
    for (let i = 0; i < 65; i++) saveBatteryRecord(trip(50, 45, 5, `trip-${i}`));
    const records = loadBatteryRecords();
    expect(records).toHaveLength(60);
    expect(records[0]!.startedAt).toBe("trip-5");
  });

  it("reads corrupted or foreign data as no records", () => {
    localStorage.setItem("ecoride-battery-trips", "{not json");
    expect(loadBatteryRecords()).toEqual([]);
    localStorage.setItem("ecoride-battery-trips", JSON.stringify({ a: 1 }));
    expect(loadBatteryRecords()).toEqual([]);
    const good = trip(50, 45, 5);
    localStorage.setItem(
      "ecoride-battery-trips",
      JSON.stringify([good, null, { ...good, endRangeKm: "45" }, { ...good, minRangeKm: null }]),
    );
    expect(loadBatteryRecords()).toEqual([good]);
  });

  it("does not throw when the storage is full", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveBatteryRecord(trip(50, 45, 5))).not.toThrow();
    setItem.mockRestore();
  });
});
