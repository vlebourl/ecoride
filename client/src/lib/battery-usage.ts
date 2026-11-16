// What a trip costs in battery, and the real range learned from past trips.
//
// The Super73 (protocol v1) sends no state of charge. Record 0203 byte 8 is the
// bike's own *estimate* of its remaining range, in whole km — the number on its
// RANGE screen (validated on a real bike: raw 57 ↔ 57 km / 35 mi displayed).
// Everything below is derived from that estimate. Nothing here measures energy.
//
// Method (docs/architecture/battery-range-learning.md):
//   - a trip record keeps the first and the latest range reading, each with the
//     trip distance at that moment, so a late connection or an early
//     disconnection yields a shorter measured segment instead of a made-up one;
//   - learned range = 60 × Σ km ridden / Σ km of displayed range lost, over the
//     most recent counted trips. A ratio of sums, not a mean of ratios: readings
//     are whole km, so a short trip is off by up to ±1 km and must weigh little.

/**
 * Range the bike shows on a full charge, and the divisor behind ecoRide's
 * derived "percent". Same value as SUPER73_BASE_MAX_RANGE (a test keeps them
 * equal) — not imported so that tests mocking super73-ble keep working.
 */
export const DISPLAYED_FULL_RANGE_KM = 60;

/** Below this measured distance a ±1 km reading error swamps the result. */
export const MIN_MEASURED_KM = 1;
/** A reading this far above the lowest one seen means the battery was charged or swapped. */
export const RECHARGE_RISE_KM = 5;
/** A trip losing over 4 displayed km per km ridden, or under 1 per 4, is a faulty reading. */
export const PLAUSIBLE_RATIO = 4;
/** Two whole-km readings: their difference is off by up to ±1 km; 2 leaves margin. */
export const READING_SLACK_KM = 2;
export const MIN_LEARNING_TRIPS = 3;
/** Displayed km lost across counted trips before anything is shown (a third of a charge). */
export const MIN_LEARNING_DROP_KM = 20;
/** Only the most recent counted trips: a battery ages and winter shortens range. */
export const LEARNING_WINDOW = 20;

const STORAGE_KEY = "ecoride-battery-trips";
const MAX_RECORDS = 60;

export interface BatterySample {
  /** The bike's range estimate, whole km. */
  rangeKm: number;
  /** Trip distance when it was read. */
  distanceKm: number;
  /** Bike in race mode at this reading (#423). */
  race?: boolean;
}

export interface BatteryTripRecord {
  /** The trip's `startedAt` — the key shared with the saved trip. */
  startedAt: string;
  startRangeKm: number;
  startDistanceKm: number;
  endRangeKm: number;
  endDistanceKm: number;
  /** Lowest reading seen, to spot a recharge in the middle of a trip. */
  minRangeKm: number;
  recharged: boolean;
  /**
   * Km of the measured segment ridden in race mode (#423), each step credited to
   * the mode of the reading that opened it. Absent on records saved before #423.
   */
  raceKm?: number;
  lastRace?: boolean;
}

/** Fold one reading into a trip's record. Undefined until a usable first reading. */
export function applySample(
  record: BatteryTripRecord | undefined,
  startedAt: string,
  sample: BatterySample,
): BatteryTripRecord | undefined {
  const { rangeKm, distanceKm } = sample;
  if (!Number.isFinite(rangeKm) || !Number.isFinite(distanceKm)) return record;
  if (!record) {
    // parseRidePacket caps the reading at 60, so 60 means "60 or more": not a
    // usable starting point. The first reading below the cap starts the record.
    if (rangeKm >= DISPLAYED_FULL_RANGE_KM) return undefined;
    return {
      startedAt,
      startRangeKm: rangeKm,
      startDistanceKm: distanceKm,
      endRangeKm: rangeKm,
      endDistanceKm: distanceKm,
      minRangeKm: rangeKm,
      recharged: false,
      raceKm: 0,
      lastRace: sample.race === true,
    };
  }
  const stepKm = Math.max(0, distanceKm - record.endDistanceKm);
  return {
    ...record,
    raceKm:
      record.raceKm === undefined ? undefined : record.raceKm + (record.lastRace ? stepKm : 0),
    lastRace: sample.race === true,
    endRangeKm: rangeKm,
    endDistanceKm: distanceKm,
    minRangeKm: Math.min(record.minRangeKm, rangeKm),
    recharged: record.recharged || rangeKm >= record.minRangeKm + RECHARGE_RISE_KM,
  };
}

export interface TripConsumption {
  startRangeKm: number;
  endRangeKm: number;
  /** Displayed range lost (start − end). Negative when the estimate rose. */
  dropKm: number;
  /** Derived from the estimate (drop ÷ 60 km) — not a measured charge. */
  dropPercent: number;
  /** Distance between the two readings; shorter than the trip if the bike connected late. */
  measuredKm: number;
  /** Displayed km lost per km ridden. */
  dropPerKm: number;
}

/** Null without two readings far enough apart, or when the battery was recharged. */
export function tripConsumption(record: BatteryTripRecord): TripConsumption | null {
  const measuredKm = record.endDistanceKm - record.startDistanceKm;
  if (record.recharged || !(measuredKm >= MIN_MEASURED_KM)) return null;
  const dropKm = record.startRangeKm - record.endRangeKm;
  return {
    startRangeKm: record.startRangeKm,
    endRangeKm: record.endRangeKm,
    dropKm,
    dropPercent: (dropKm / DISPLAYED_FULL_RANGE_KM) * 100,
    measuredKm,
    dropPerKm: dropKm / measuredKm,
  };
}

// ponytail: fixed physical band rather than a statistical outlier test, which
// is unstable on a handful of trips. Move to median/MAD once there are dozens.
function isPlausible({ dropKm, measuredKm }: TripConsumption): boolean {
  return (
    dropKm <= PLAUSIBLE_RATIO * measuredKm + READING_SLACK_KM &&
    dropKm >= measuredKm / PLAUSIBLE_RATIO - READING_SLACK_KM
  );
}

export interface LearnedRange {
  /** Real km on a full charge. Null until enough trips — never a guess. */
  fullRangeKm: number | null;
  /** Real km ridden per km of range the bike displays. */
  kmPerDisplayedKm: number | null;
  /** Counted trips and the displayed km they lost: progress towards the threshold. */
  tripCount: number;
  dropKm: number;
}

/** `records` oldest first, as stored. */
export function learnRange(records: BatteryTripRecord[]): LearnedRange {
  const counted = records
    .map(tripConsumption)
    .filter((c): c is TripConsumption => c !== null && isPlausible(c))
    .slice(-LEARNING_WINDOW);
  const dropKm = counted.reduce((sum, c) => sum + c.dropKm, 0);
  const riddenKm = counted.reduce((sum, c) => sum + c.measuredKm, 0);
  const enough = counted.length >= MIN_LEARNING_TRIPS && dropKm >= MIN_LEARNING_DROP_KM;
  const kmPerDisplayedKm = enough ? riddenKm / dropKm : null;
  return {
    fullRangeKm: kmPerDisplayedKm === null ? null : kmPerDisplayedKm * DISPLAYED_FULL_RANGE_KM,
    kmPerDisplayedKm,
    tripCount: counted.length,
    dropKm,
  };
}

/** The bike's current estimate rescaled by what past trips taught. Null if either is missing. */
export function learnedRemainingKm(rangeKm: number | null, learned: LearnedRange): number | null {
  if (rangeKm === null || learned.kmPerDisplayedKm === null) return null;
  return rangeKm * learned.kmPerDisplayedKm;
}

// ---- Storage (localStorage, this device only) ----

function isRecord(value: unknown): value is BatteryTripRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.startedAt === "string" &&
    typeof r.recharged === "boolean" &&
    [r.startRangeKm, r.startDistanceKm, r.endRangeKm, r.endDistanceKm, r.minRangeKm].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    )
  );
}

export function loadBatteryRecords(): BatteryTripRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

/** The server may reformat the ISO string, so trips are matched on the instant. */
export function findBatteryRecord(
  startedAt: string,
  records: BatteryTripRecord[] = loadBatteryRecords(),
): BatteryTripRecord | undefined {
  const time = new Date(startedAt).getTime();
  return records.find((r) => new Date(r.startedAt).getTime() === time);
}

export function saveBatteryRecord(record: BatteryTripRecord): void {
  const others = loadBatteryRecords().filter((r) => r.startedAt !== record.startedAt);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...others, record].slice(-MAX_RECORDS)));
  } catch {
    // Storage full or unavailable: this trip simply has no battery figure.
  }
}

/**
 * True when the remaining range will not cover the rest of the route (#422).
 * The margin (10 %, at least 1 km) absorbs the range estimate's noise so the
 * alert does not flicker on a route the battery covers just barely.
 */
export function isRangeShort(rangeKm: number | null, remainingMetres: number | null): boolean {
  if (rangeKm === null || remainingMetres === null) return false;
  const remainingKm = remainingMetres / 1000;
  return rangeKm < remainingKm + Math.max(1, remainingKm * 0.1);
}

// ---- Insights (#423) ----

/** A trip counts for a mode when at least this share of it was ridden in that mode. */
export const MODE_SHARE = 0.8;
export const MIN_MODE_TRIPS = 2;
export const MIN_MODE_DROP_KM = 5;

export interface ModeComparison {
  /** Displayed km lost per km ridden, outside race and in race. */
  ecoPerKm: number;
  racePerKm: number;
  /** How much more race costs per km, in percent. */
  extraPercent: number;
}

function countedConsumptions(records: BatteryTripRecord[]) {
  return records
    .map((r) => ({ r, c: tripConsumption(r) }))
    .filter(
      (x): x is { r: BatteryTripRecord; c: TripConsumption } => x.c !== null && isPlausible(x.c),
    );
}

/** Race vs the other modes, from trips ridden mostly in one of them. Null until both have data. */
export function compareModes(records: BatteryTripRecord[]): ModeComparison | null {
  const sums = { eco: { drop: 0, km: 0, n: 0 }, race: { drop: 0, km: 0, n: 0 } };
  for (const { r, c } of countedConsumptions(records)) {
    if (r.raceKm === undefined) continue;
    const share = r.raceKm / c.measuredKm;
    const bucket = share >= MODE_SHARE ? sums.race : share <= 1 - MODE_SHARE ? sums.eco : null;
    if (!bucket) continue;
    bucket.drop += c.dropKm;
    bucket.km += c.measuredKm;
    bucket.n += 1;
  }
  const ready = (b: { drop: number; n: number }) =>
    b.n >= MIN_MODE_TRIPS && b.drop >= MIN_MODE_DROP_KM;
  if (!ready(sums.eco) || !ready(sums.race)) return null;
  const ecoPerKm = sums.eco.drop / sums.eco.km;
  const racePerKm = sums.race.drop / sums.race.km;
  return { ecoPerKm, racePerKm, extraPercent: (racePerKm / ecoPerKm - 1) * 100 };
}

/**
 * Learned full-charge range per calendar month (YYYY-MM, oldest first), only for
 * months with enough trips on their own — a slow decline is battery wear.
 * ponytail: limited to the 60 records kept on this device; persist them
 * server-side if months-long history matters.
 */
export function rangeByMonth(
  records: BatteryTripRecord[],
): { month: string; fullRangeKm: number }[] {
  const months = new Map<string, BatteryTripRecord[]>();
  for (const r of records) {
    const month = r.startedAt.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), r]);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rs]) => ({ month, fullRangeKm: learnRange(rs).fullRangeKm }))
    .filter((m): m is { month: string; fullRangeKm: number } => m.fullRangeKm !== null);
}
