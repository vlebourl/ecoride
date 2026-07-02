import { Bike } from "lucide-react";
import type { Trip } from "@ecoride/shared/types";
import { formatDayMonthTime } from "@/lib/format-utils";
import { tripLabelKey } from "@/lib/trip-utils";
import { useT } from "@/i18n/provider";

type StatsRecentTripsSectionProps = {
  trips: Trip[];
  userTimezone?: string;
  onSelectTrip: (trip: Trip) => void;
};

export function StatsRecentTripsSection({
  trips,
  userTimezone,
  onSelectTrip,
}: StatsRecentTripsSectionProps) {
  const t = useT();

  return (
    <section className="space-y-6">
      <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
        {t("stats.recent.title")}
      </h3>
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {trips.length === 0 && (
          <p className="text-center text-sm text-text-muted">{t("stats.recent.empty")}</p>
        )}
        {trips.map((trip) => (
          <button
            key={trip.id}
            onClick={() => onSelectTrip(trip)}
            className="flex w-full items-center justify-between rounded-xl border border-outline-variant/5 bg-surface-low p-4 text-left transition-transform active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-high">
                <Bike size={20} className="text-primary-light" />
              </div>
              <div>
                <p className="text-sm font-bold">{t(tripLabelKey(trip.startedAt))}</p>
                <p className="text-xs font-medium text-on-surface-variant">
                  {formatDayMonthTime(trip.startedAt, userTimezone)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-primary-light">
                +{Number(trip.distanceKm).toFixed(1)} {t("stats.recent.kmSuffix")}
              </p>
              <p className="text-xs font-bold uppercase tracking-tighter text-on-surface-variant">
                {trip.co2SavedKg.toFixed(1)} {t("stats.recent.co2Suffix")}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
