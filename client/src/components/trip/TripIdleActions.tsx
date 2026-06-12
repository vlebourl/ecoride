import { Keyboard, MapPin, Play, X } from "lucide-react";
import { useT } from "@/i18n/provider";

interface TripIdleActionsProps {
  isSaving: boolean;
  destination: { label: string } | null;
  destinationLoading: boolean;
  onStart: () => void;
  onOpenDestinationSearch: () => void;
  onClearDestination: () => void;
  onOpenManual: () => void;
}

export function TripIdleActions({
  isSaving,
  destination,
  destinationLoading,
  onStart,
  onOpenDestinationSearch,
  onClearDestination,
  onOpenManual,
}: TripIdleActionsProps) {
  const t = useT();

  return (
    <div className="space-y-3 px-6 py-6">
      <button
        onClick={onStart}
        disabled={isSaving}
        className="flex w-full items-center justify-center gap-4 rounded-xl bg-primary py-6 shadow-[0px_20px_40px_rgba(0,0,0,0.4)] active:scale-95 disabled:opacity-50"
      >
        <Play size={28} className="text-bg" fill="currentColor" />
        <span className="text-xl font-black uppercase tracking-widest text-bg">
          {isSaving ? t("trip.start.saving") : t("trip.start.label")}
        </span>
      </button>
      {destination ? (
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3">
          <MapPin size={16} className="shrink-0 text-blue-500" />
          <span className="flex-1 truncate text-sm font-medium text-blue-700">
            {destination.label}
          </span>
          {destinationLoading && (
            <span className="text-xs text-blue-500">{t("trip.navigation.search.loading")}</span>
          )}
          <button
            type="button"
            onClick={onClearDestination}
            aria-label={t("stats.detail.closeAria")}
            className="shrink-0 text-blue-400 active:text-blue-600"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenDestinationSearch}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-text-muted py-3 active:scale-95"
        >
          <MapPin size={16} className="text-text-muted" />
          <span className="text-sm font-medium text-text-muted">
            {t("trip.navigation.addDestination")}
          </span>
        </button>
      )}

      <button
        onClick={onOpenManual}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-surface-container py-4 active:scale-95"
      >
        <Keyboard size={18} className="text-text-muted" />
        <span className="text-sm font-bold text-text-muted">{t("trip.manualButton")}</span>
      </button>
    </div>
  );
}
