import type { TripPreset } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

interface ProfileTripPresetsSectionProps {
  tripPresets: TripPreset[];
  deletePending: boolean;
  onDelete: (tripPresetId: string, label: string) => void;
}

export function ProfileTripPresetsSection({
  tripPresets,
  deletePending,
  onDelete,
}: ProfileTripPresetsSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{t("profile.presets.title")}</h2>
          <p className="mt-1 text-sm text-text-muted">{t("profile.presets.subtitle")}</p>
        </div>
      </div>
      <div className="space-y-3">
        {tripPresets.length === 0 ? (
          <div className="rounded-lg bg-surface-low p-5 text-sm text-text-muted">
            {t("profile.presets.empty")}
          </div>
        ) : (
          tripPresets.map((tripPreset) => (
            <div
              key={tripPreset.id}
              className="flex items-center justify-between gap-4 rounded-lg bg-surface-low p-5"
            >
              <div>
                <p className="text-sm font-bold text-text">{tripPreset.label}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {tripPreset.distanceKm.toFixed(1)} {t("profile.stats.kmUnit")}
                  {tripPreset.durationSec != null
                    ? ` · ${Math.round(tripPreset.durationSec / 60)} min`
                    : ` · ${t("profile.presets.customDuration")}`}
                </p>
              </div>
              <button
                onClick={() => onDelete(tripPreset.id, tripPreset.label)}
                disabled={deletePending}
                className="rounded-lg bg-danger/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-danger active:scale-95 disabled:opacity-50"
              >
                {t("profile.presets.delete")}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
