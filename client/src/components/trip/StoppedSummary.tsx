import { AlertTriangle, CloudOff } from "lucide-react";
import { useT } from "@/i18n/provider";

export interface StoppedSummaryProps {
  distance: number;
  co2Saved: number;
  elapsed: number;
  formatTime: (s: number) => string;
  onAbandon: () => void;
  onSave: () => void;
  isSaving: boolean;
  sessionPersistFailed: boolean;
  saveError: string;
}

export function StoppedSummary({
  distance,
  co2Saved,
  elapsed,
  formatTime,
  onAbandon,
  onSave,
  isSaving,
  sessionPersistFailed,
  saveError,
}: StoppedSummaryProps) {
  const t = useT();
  return (
    <div className="space-y-4 px-6 pb-4" data-no-swipe>
      <div className="rounded-xl bg-surface-container p-6">
        <h2 className="mb-4 text-lg font-bold">{t("trip.stopped.title")}</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-black text-primary-light">{distance.toFixed(1)}</div>
            <div className="text-xs font-bold uppercase text-text-muted">
              {t("trip.dashboard.km")}
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-primary-light">{co2Saved.toFixed(1)}</div>
            <div className="text-xs font-bold uppercase text-text-muted">
              {t("trip.dashboard.co2Unit")}
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-primary-light">{formatTime(elapsed)}</div>
            <div className="text-xs font-bold uppercase text-text-muted">
              {t("trip.stopped.durationLabel")}
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onAbandon}
            disabled={isSaving}
            className="flex-1 rounded-xl bg-surface-high py-4 text-sm font-bold text-text-muted active:scale-95"
          >
            {t("trip.stopped.abandon")}
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || distance < 0.01}
            title={distance < 0.01 ? t("trip.stopped.tooShortTitle") : undefined}
            className="flex-1 rounded-xl bg-primary py-4 text-sm font-black uppercase tracking-widest text-bg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "..." : t("trip.stopped.save")}
          </button>
        </div>
        {distance < 0.01 && (
          <p className="mt-3 text-center text-xs text-text-muted">
            {t("trip.stopped.tooShortMsg")}
          </p>
        )}
        {sessionPersistFailed && (
          <div className="mt-4 rounded-xl bg-danger/10 p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="shrink-0 text-danger" />
              <span className="text-sm font-medium text-danger">
                {t("trip.stopped.sessionPersistFailed")}
              </span>
            </div>
          </div>
        )}
        {saveError && (
          <div className="mt-4 rounded-xl bg-primary/10 p-4">
            <div className="flex items-center gap-3">
              <CloudOff size={16} className="shrink-0 text-primary-light" />
              <span className="text-sm font-medium text-primary-light">{saveError}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
