import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Trip } from "@ecoride/shared/types";
import type { AdminStatsTrip } from "@/hooks/queries";
import { TripMiniMap } from "@/components/TripMiniMap";
import { formatLongDate } from "@/lib/format-utils";
import { tripLabelKey } from "@/lib/trip-utils";
import { useT } from "@/i18n/provider";

type AdminTripDetailSheetProps = {
  selectedTrip: AdminStatsTrip | null;
  tripDetail: Trip | null | undefined;
  isPending: boolean;
  onClose: () => void;
};

export function AdminTripDetailSheet({
  selectedTrip,
  tripDetail,
  isPending,
  onClose,
}: AdminTripDetailSheetProps) {
  const t = useT();

  if (!selectedTrip) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={selectedTrip.userName}
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-container p-6 pb-10 animate-[slideUp_0.2s_ease-out]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-highest" />
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {selectedTrip.userName}
            </p>
            <h3 className="text-lg font-bold">{t(tripLabelKey(selectedTrip.startedAt))}</h3>
            <p className="text-sm text-text-muted">{formatLongDate(selectedTrip.startedAt)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted active:bg-surface-high"
          >
            <X size={20} />
          </button>
        </div>
        {isPending && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!isPending && tripDetail && (
          <>
            {Array.isArray(tripDetail.gpsPoints) && tripDetail.gpsPoints.length > 1 ? (
              <TripMiniMap gpsPoints={tripDetail.gpsPoints} />
            ) : (
              <p className="mb-4 text-center text-xs text-text-dim">
                {t("stats.detail.manualEntry")}
              </p>
            )}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xl font-bold text-primary-light">
                  {Number(tripDetail.distanceKm).toFixed(1)}
                </p>
                <p className="text-xs font-bold uppercase text-text-muted">
                  {t("stats.detail.km")}
                </p>
              </div>
              <div>
                <p className="text-xl font-bold text-primary-light">
                  {tripDetail.co2SavedKg.toFixed(1)}
                </p>
                <p className="text-xs font-bold uppercase text-text-muted">
                  {t("stats.detail.co2")}
                </p>
              </div>
              <div>
                <p className="text-xl font-bold text-primary-light">
                  {tripDetail.moneySavedEur.toFixed(2)}
                </p>
                <p className="text-xs font-bold uppercase text-text-muted">
                  {t("stats.detail.eur")}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
