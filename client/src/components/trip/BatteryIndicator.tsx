import { BatteryMedium, Triangle } from "lucide-react";
import { useT } from "@/i18n/provider";

interface BatteryIndicatorProps {
  /** Estimated battery percentage 0–100, or null when unknown (component hides). */
  percent: number | null;
  /** Estimated remaining range in km, or null. */
  rangeKm: number | null;
}

export function BatteryIndicator({ percent, rangeKm }: BatteryIndicatorProps) {
  const t = useT();
  if (percent == null) return null;
  return (
    <div className="flex flex-col items-center leading-tight" data-testid="battery-indicator">
      <span className="flex items-center gap-1 rounded-md bg-primary/20 px-2 py-0.5 text-sm font-bold text-primary-light">
        <BatteryMedium size={16} aria-hidden />
        {percent}%
      </span>
      {rangeKm != null && (
        <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-text-dim">
          <Triangle size={10} aria-hidden />
          {rangeKm.toFixed(0)} {t("trip.dashboard.km")}
        </span>
      )}
    </div>
  );
}
