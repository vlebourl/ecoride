import { useBatteryInsights, useBatteryRecorder, useLearnedRange } from "@/hooks/useBatteryUsage";
import { useSuper73 } from "@/hooks/useSuper73";
import {
  DISPLAYED_FULL_RANGE_KM,
  MIN_LEARNING_DROP_KM,
  MIN_LEARNING_TRIPS,
  findBatteryRecord,
  learnedRemainingKm,
  tripConsumption,
} from "@/lib/battery-usage";
import { useT } from "@/i18n/provider";

/** Mounts the recorder inside the GPS and Super73 providers. Renders nothing. */
export function BatteryUsageRecorder() {
  useBatteryRecorder();
  return null;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** Battery cost of one saved trip. Renders nothing when the trip was not measured. */
export function TripBatteryUsage({ startedAt }: { startedAt: string }) {
  const t = useT();
  const record = findBatteryRecord(startedAt);
  const usage = record ? tripConsumption(record) : null;
  if (!usage) return null;
  return (
    <div className="mb-6 rounded-xl bg-surface-low p-4" data-testid="trip-battery-usage">
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
        {t("stats.detail.battery.title")}
      </p>
      <p className="mt-1 text-sm font-bold text-text">
        {t("stats.detail.battery.readings", {
          start: usage.startRangeKm,
          end: usage.endRangeKm,
          delta: signed(-usage.dropKm),
          percent: signed(-Math.round(usage.dropPercent)),
        })}
      </p>
      <p className="mt-1 text-xs text-text-dim">
        {t("stats.detail.battery.ratio", {
          ratio: usage.dropPerKm.toFixed(2),
          km: usage.measuredKm.toFixed(1),
        })}
      </p>
    </div>
  );
}

/** Vehicle page: the range learned from past trips, or how far the learning is. */
export function BatteryRangeCard() {
  const t = useT();
  const ble = useSuper73();
  const learned = useLearnedRange();
  const insights = useBatteryInsights();
  const bikeRangeKm = ble.status === "connected" ? (ble.rangeKm ?? null) : null;
  const remainingKm = learnedRemainingKm(bikeRangeKm, learned);

  return (
    <section className="rounded-2xl bg-surface-container p-4" data-testid="battery-range-card">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
        {t("vehicle.battery.title")}
      </h2>
      {learned.fullRangeKm !== null && learned.kmPerDisplayedKm !== null ? (
        <>
          <p className="text-xs text-text-dim">{t("vehicle.battery.learnedLabel")}</p>
          <p className="text-2xl font-bold text-primary-light">
            {t("vehicle.battery.approxKm", { km: learned.fullRangeKm.toFixed(0) })}
          </p>
          <p className="mt-1 text-xs text-text-dim">
            {t("vehicle.battery.basis", {
              count: learned.tripCount,
              ratio: learned.kmPerDisplayedKm.toFixed(2),
            })}
          </p>
          {remainingKm !== null && bikeRangeKm !== null && (
            <p className="mt-2 text-sm text-text">
              {t("vehicle.battery.remaining", {
                km: remainingKm.toFixed(0),
                bike: bikeRangeKm.toFixed(0),
              })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-text">
          {t("vehicle.battery.pending", {
            count: learned.tripCount,
            minTrips: MIN_LEARNING_TRIPS,
            drop: Math.max(0, learned.dropKm).toFixed(0),
            minDrop: MIN_LEARNING_DROP_KM,
          })}
        </p>
      )}
      {insights.modes && (
        <p className="mt-3 text-sm text-text" data-testid="battery-mode-cost">
          {t("vehicle.battery.raceCost", {
            percent: `${insights.modes.extraPercent > 0 ? "+" : ""}${Math.round(insights.modes.extraPercent)}`,
          })}
        </p>
      )}
      {insights.months.length >= 2 && (
        <div className="mt-3" data-testid="battery-months">
          <p className="text-xs text-text-dim">{t("vehicle.battery.monthsLabel")}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-text">
            {insights.months.map((m) => (
              <li key={m.month} className="flex justify-between">
                <span>{m.month}</span>
                <span>{t("vehicle.battery.approxKm", { km: m.fullRangeKm.toFixed(0) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-text-dim">
        {t("vehicle.battery.note", { full: DISPLAYED_FULL_RANGE_KM })}
      </p>
    </section>
  );
}
