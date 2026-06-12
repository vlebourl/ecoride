import { createPortal } from "react-dom";
import { Save, Trash2, X } from "lucide-react";
import type { MouseEvent } from "react";
import type { Trip } from "@ecoride/shared/types";
import { TripMiniMap } from "@/components/TripMiniMap";
import { formatLongDate } from "@/lib/format-utils";
import { tripLabelKey } from "@/lib/trip-utils";
import { useT } from "@/i18n/provider";

type StatsTripDetailSheetProps = {
  selectedTrip: Trip | null;
  displayTrip: Trip | null;
  hasGpsTrack: boolean;
  gpsPoints: Trip["gpsPoints"] | undefined;
  userTimezone?: string;
  tripPresetFormOpen: boolean;
  tripPresetLabel: string;
  isCreatingPreset: boolean;
  isDeletingTrip: boolean;
  onClose: () => void;
  onTogglePresetForm: () => void;
  onTripPresetLabelChange: (label: string) => void;
  onSaveTripPreset: () => void;
  onCancelTripPreset: () => void;
  onDeleteTrip: () => void;
};

export function StatsTripDetailSheet({
  selectedTrip,
  displayTrip,
  hasGpsTrack,
  gpsPoints,
  userTimezone,
  tripPresetFormOpen,
  tripPresetLabel,
  isCreatingPreset,
  isDeletingTrip,
  onClose,
  onTogglePresetForm,
  onTripPresetLabelChange,
  onSaveTripPreset,
  onCancelTripPreset,
  onDeleteTrip,
}: StatsTripDetailSheetProps) {
  const t = useT();

  if (!selectedTrip || !displayTrip) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("stats.detail.dialogAria")}
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-container p-6 pb-10 animate-[slideUp_0.2s_ease-out]"
        onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-highest" />

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">{t(tripLabelKey(selectedTrip.startedAt))}</h3>
            <p className="text-sm text-text-muted">
              {formatLongDate(selectedTrip.startedAt, userTimezone)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("stats.detail.closeAria")}
            className="rounded-lg p-2 text-text-muted active:bg-surface-high"
          >
            <X size={20} />
          </button>
        </div>

        {hasGpsTrack && gpsPoints && <TripMiniMap gpsPoints={gpsPoints} />}

        {!hasGpsTrack && (
          <p className="mb-4 text-center text-xs text-text-dim">{t("stats.detail.manualEntry")}</p>
        )}

        <div className="mb-6 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-bold text-primary-light">
              {Number(displayTrip.distanceKm).toFixed(1)}
            </p>
            <p className="text-xs font-bold uppercase text-text-muted">{t("stats.detail.km")}</p>
          </div>
          <div>
            <p className="text-xl font-bold text-primary-light">
              {displayTrip.co2SavedKg.toFixed(1)}
            </p>
            <p className="text-xs font-bold uppercase text-text-muted">{t("stats.detail.co2")}</p>
          </div>
          <div>
            <p className="text-xl font-bold text-primary-light">
              {displayTrip.moneySavedEur.toFixed(2)}
            </p>
            <p className="text-xs font-bold uppercase text-text-muted">{t("stats.detail.eur")}</p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={onTogglePresetForm}
            disabled={isCreatingPreset}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-3 text-sm font-bold text-primary-light active:scale-95 disabled:opacity-50"
          >
            <Save size={16} />
            {tripPresetFormOpen ? t("stats.detail.hideForm") : t("stats.detail.createPreset")}
          </button>

          {tripPresetFormOpen && (
            <div className="rounded-xl bg-surface-low p-4">
              <label
                htmlFor="trip-preset-label-input"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted"
              >
                {t("stats.detail.presetLabel")}
              </label>
              <input
                id="trip-preset-label-input"
                type="text"
                value={tripPresetLabel}
                onChange={(event) => onTripPresetLabelChange(event.target.value)}
                className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="mt-3 flex gap-3">
                <button
                  onClick={onSaveTripPreset}
                  disabled={isCreatingPreset || !tripPresetLabel.trim()}
                  className="flex-1 rounded-lg bg-primary py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
                >
                  {isCreatingPreset ? t("stats.detail.saving") : t("stats.detail.save")}
                </button>
                <button
                  onClick={onCancelTripPreset}
                  disabled={isCreatingPreset}
                  className="flex-1 rounded-lg bg-surface-high py-3 text-sm font-bold text-text-muted active:scale-95 disabled:opacity-50"
                >
                  {t("stats.detail.cancel")}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onDeleteTrip}
            disabled={isDeletingTrip || isCreatingPreset}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-danger/10 py-3 text-sm font-bold text-danger active:scale-95 disabled:opacity-50"
          >
            <Trash2 size={16} />
            {isDeletingTrip ? t("stats.detail.deleting") : t("stats.detail.delete")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
