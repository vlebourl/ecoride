import { CloudOff } from "lucide-react";
import type { TripPreset } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

export interface ManualEntryFormProps {
  manualKm: string;
  setManualKm: (v: string) => void;
  manualMinutes: string;
  setManualMinutes: (v: string) => void;
  manualPresetId: string;
  setManualPresetId: (v: string) => void;
  onPresetChange: (value: string) => void;
  tripPresets: TripPreset[];
  onSubmit: (km: number, durationSec: number) => void;
  onCancel: () => void;
  isSaving: boolean;
  saveError: string;
}

export function ManualEntryForm({
  manualKm,
  setManualKm,
  manualMinutes,
  setManualMinutes,
  manualPresetId,
  setManualPresetId,
  onPresetChange,
  tripPresets,
  onSubmit,
  onCancel,
  isSaving,
  saveError,
}: ManualEntryFormProps) {
  const t = useT();
  return (
    <div className="min-h-0 overflow-y-auto px-6 pb-4">
      <form
        className="rounded-xl bg-surface-container p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const km = parseFloat(manualKm);
          if (km > 0) {
            const durationSec = manualMinutes
              ? parseInt(manualMinutes) * 60
              : Math.round((km / 15) * 3600); // Fallback: estimate ~15 km/h
            onSubmit(km, durationSec);
          }
        }}
      >
        <h2 className="mb-4 text-lg font-bold">{t("trip.manual.title")}</h2>
        <p className="mb-4 text-sm text-text-muted">{t("trip.manual.subtitle")}</p>
        <label
          htmlFor="manual-preset-select"
          className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted"
        >
          {t("trip.manual.presetLabel")}
        </label>
        <select
          id="manual-preset-select"
          value={manualPresetId}
          onChange={(e) => onPresetChange(e.target.value)}
          className="mb-4 w-full rounded-lg bg-surface-high p-4 text-base font-bold text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="custom">{t("trip.manual.custom")}</option>
          {tripPresets.map((tripPreset) => (
            <option key={tripPreset.id} value={tripPreset.id}>
              {tripPreset.label}
            </option>
          ))}
        </select>
        <label
          htmlFor="manual-distance-input"
          className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted"
        >
          {t("trip.manual.distanceLabel")}
        </label>
        <input
          id="manual-distance-input"
          type="number"
          value={manualKm}
          onChange={(e) => {
            setManualPresetId("custom");
            setManualKm(e.target.value);
          }}
          placeholder="0.0"
          className="mb-4 w-full rounded-lg bg-surface-high p-4 text-2xl font-bold text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <label
          htmlFor="manual-duration-input"
          className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted"
        >
          {t("trip.manual.durationLabel")}
        </label>
        <input
          id="manual-duration-input"
          type="number"
          value={manualMinutes}
          onChange={(e) => {
            setManualPresetId("custom");
            setManualMinutes(e.target.value);
          }}
          placeholder={t("trip.manual.durationPlaceholder")}
          className="mb-4 w-full rounded-lg bg-surface-high p-4 text-2xl font-bold text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-surface-high py-4 text-sm font-bold text-text-muted active:scale-95"
          >
            {t("trip.manual.cancel")}
          </button>
          <button
            type="submit"
            disabled={isSaving || !manualKm || parseFloat(manualKm) <= 0}
            className="flex-1 rounded-xl bg-primary py-4 text-sm font-black uppercase tracking-widest text-bg active:scale-95 disabled:opacity-50"
          >
            {isSaving ? "..." : t("trip.manual.save")}
          </button>
        </div>
        {saveError && (
          <div className="mt-4 rounded-xl bg-primary/10 p-4">
            <div className="flex items-center gap-3">
              <CloudOff size={16} className="shrink-0 text-primary-light" />
              <span className="text-sm font-medium text-primary-light">{saveError}</span>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
