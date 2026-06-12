import { Bike } from "lucide-react";
import type { AdminStatsTrip } from "@/hooks/queries";
import { formatDate, formatDuration } from "@/lib/format-utils";
import { useT } from "@/i18n/provider";

type AdminRecentTripsSectionProps = {
  trips: AdminStatsTrip[];
  statsPending: boolean;
  onSelectTrip: (trip: AdminStatsTrip) => void;
};

export function AdminRecentTripsSection({
  trips,
  statsPending,
  onSelectTrip,
}: AdminRecentTripsSectionProps) {
  const t = useT();

  return (
    <section className="rounded-xl bg-surface-low p-5">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
        {t("admin.recentTrips.title")}
      </h2>
      {statsPending ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : trips.length > 0 ? (
        <div className="max-h-80 space-y-3 overflow-auto">
          {trips.map((trip) => (
            <button
              key={trip.id}
              onClick={() => onSelectTrip(trip)}
              className="flex w-full items-center gap-3 rounded-lg bg-surface-high p-3 text-left active:bg-surface-highest"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Bike size={18} className="text-primary-light" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-bold text-text">{trip.userName}</span>
                  <span className="shrink-0 text-xs text-text-dim">
                    {trip.distanceKm.toFixed(1)} {t("admin.recentTrips.kmUnit")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span>{formatDate(trip.startedAt)}</span>
                  <span>-</span>
                  <span>{formatDuration(trip.durationSec)}</span>
                  <span>-</span>
                  <span>
                    {trip.co2SavedKg.toFixed(1)} {t("admin.recentTrips.co2Unit")}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-text-muted">{t("admin.recentTrips.empty")}</p>
      )}
    </section>
  );
}
