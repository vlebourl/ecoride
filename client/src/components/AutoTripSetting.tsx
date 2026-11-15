import { useState } from "react";
import { AUTO_TRIP_CONFIG, isAutoTripEnabled, setAutoTripEnabled } from "@/lib/auto-trip";
import { useT } from "@/i18n/provider";

/** On/off switch for auto start/stop of trips. Stored on this device only. */
export function AutoTripSetting() {
  const t = useT();
  const [enabled, setEnabled] = useState(isAutoTripEnabled);

  const toggle = () => {
    setAutoTripEnabled(!enabled);
    setEnabled(!enabled);
  };

  return (
    <section className="rounded-2xl bg-surface-container p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
        {t("vehicle.autoTrip.title")}
      </h2>
      <p className="mb-3 mt-1 text-xs text-text-dim">{t("vehicle.autoTrip.subtitle")}</p>
      <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-high px-4 py-3">
        <div>
          <span className="block text-sm font-semibold text-text">
            {t("vehicle.autoTrip.toggleLabel")}
          </span>
          <span className="block text-xs text-text-dim">
            {t("vehicle.autoTrip.toggleHint", {
              speed: AUTO_TRIP_CONFIG.startSpeedKmh,
              hold: AUTO_TRIP_CONFIG.startHoldMs / 1000,
              stop: AUTO_TRIP_CONFIG.stopAfterMs / 60_000,
            })}
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
          aria-label={t("vehicle.autoTrip.toggleLabel")}
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
