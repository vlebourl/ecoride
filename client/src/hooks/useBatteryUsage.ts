import { useEffect, useState } from "react";
import { getTrackingSession, useAppGpsTracking } from "@/hooks/useGpsTracking";
import { useSuper73 } from "@/hooks/useSuper73";
import {
  applySample,
  findBatteryRecord,
  learnRange,
  loadBatteryRecords,
  saveBatteryRecord,
  type LearnedRange,
} from "@/lib/battery-usage";

/**
 * While a trip is tracked and the bike is connected, keeps that trip's first
 * and latest range reading (see lib/battery-usage.ts). Mounted once, inside
 * both providers. A trip the bike never reported on leaves no record.
 */
export function useBatteryRecorder(): void {
  const { isTracking, isPaused, distanceKm } = useAppGpsTracking().state;
  const ble = useSuper73();
  // useSuper73 clears rangeKm on disconnect, so a non-null value was read on
  // the current connection — never a leftover from before a recharge.
  const rangeKm = ble.status === "connected" ? ble.rangeKm : null;
  // ponytail: one sample per 100 m is plenty against whole-km readings, and
  // keeps localStorage writes off the 1 Hz GPS path.
  const distanceStep = Math.floor(distanceKm * 10);

  useEffect(() => {
    if (!isTracking || rangeKm === null) return;
    const startedAt = getTrackingSession();
    if (!startedAt) return;
    const record = applySample(findBatteryRecord(startedAt), startedAt, { rangeKm, distanceKm });
    if (record) saveBatteryRecord(record);
    // distanceKm is read at its exact value but only re-triggers per 100 m step;
    // isPaused re-triggers so pausing (the first step of stopping) takes a final reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking, isPaused, rangeKm, distanceStep]);
}

/**
 * ponytail: read once per mount — a trip finished while the page stays open
 * shows up on the next visit. Subscribe to the store if that ever matters.
 */
export function useLearnedRange(): LearnedRange {
  const [learned] = useState(() => learnRange(loadBatteryRecords()));
  return learned;
}
