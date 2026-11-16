import { BatteryWarning } from "lucide-react";
import { useT } from "@/i18n/provider";

/**
 * Guided-trip warning (#422): the bike's range will not cover the rest of the
 * route. Offers eco when the bike is in another mode.
 */
export function RangeAlert({
  rangeKm,
  remainingKm,
  canSwitchToEco,
  onSwitchToEco,
}: {
  rangeKm: number;
  remainingKm: number;
  canSwitchToEco: boolean;
  onSwitchToEco: () => void;
}) {
  const t = useT();
  return (
    <div
      role="alert"
      data-testid="range-alert"
      className="mx-3 mt-2 flex items-center gap-3 rounded-xl bg-danger/15 px-3 py-2 text-sm text-danger"
    >
      <BatteryWarning size={22} aria-hidden className="shrink-0" />
      <span className="flex-1">
        {t("trip.rangeAlert.message", {
          range: rangeKm.toFixed(0),
          remaining: remainingKm.toFixed(1),
        })}
      </span>
      {canSwitchToEco && (
        <button
          type="button"
          onClick={onSwitchToEco}
          className="min-h-11 shrink-0 rounded-lg bg-danger px-3 font-semibold text-white active:scale-95"
        >
          {t("trip.rangeAlert.switchToEco")}
        </button>
      )}
    </div>
  );
}
