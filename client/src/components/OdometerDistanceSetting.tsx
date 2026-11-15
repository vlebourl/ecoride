import { useState } from "react";
import {
  MIN_ODOMETER_SEGMENT_KM,
  isOdometerDistanceEnabled,
  setOdometerDistanceEnabled,
} from "@/lib/trip-odometer";
import { useT } from "@/i18n/provider";

/** On/off switch for the odometer trip distance. Off by default, stored on this device only. */
export function OdometerDistanceSetting() {
  const t = useT();
  const [enabled, setEnabled] = useState(isOdometerDistanceEnabled);

  const toggle = () => {
    setOdometerDistanceEnabled(!enabled);
    setEnabled(!enabled);
  };

  return (
    <section className="rounded-2xl bg-surface-container p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
        {t("vehicle.odometerDistance.title")}
      </h2>
      <p className="mb-3 mt-1 text-xs text-text-dim">{t("vehicle.odometerDistance.subtitle")}</p>
      <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-high px-4 py-3">
        <div>
          <span className="block text-sm font-semibold text-text">
            {t("vehicle.odometerDistance.toggleLabel")}
          </span>
          <span className="block text-xs text-text-dim">
            {t("vehicle.odometerDistance.toggleHint", { minKm: MIN_ODOMETER_SEGMENT_KM })}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-surface"
          }`}
          aria-label={t("vehicle.odometerDistance.toggleLabel")}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </label>
    </section>
  );
}
