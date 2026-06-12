import { Droplets } from "lucide-react";
import { useT } from "@/i18n/provider";

interface ProfileSummarySectionProps {
  user: {
    name: string;
    image: string | null;
  };
  stats: {
    totalCo2SavedKg: number;
    totalDistanceKm: number;
    tripCount: number;
    totalFuelSavedL: number;
    totalMoneySavedEur: number;
  };
  fuelPrice:
    | {
        priceEur: number;
        fuelType: string;
        stationName?: string | null;
      }
    | null
    | undefined;
  fuelPriceLoading: boolean;
}

export function ProfileSummarySection({
  user,
  stats,
  fuelPrice,
  fuelPriceLoading,
}: ProfileSummarySectionProps) {
  const t = useT();

  return (
    <>
      <section className="flex flex-col items-center space-y-4 text-center">
        <div className="relative">
          <div className="rounded-full bg-gradient-to-tr from-primary to-primary-dark p-1">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface">
              {user.image ? (
                <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-primary-light">{user.name.charAt(0)}</span>
              )}
            </div>
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-text">{user.name}</h2>
          <div className="mt-1 inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-light">
            {t("profile.ecoRiderBadge")}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="group relative col-span-2 overflow-hidden rounded-lg bg-surface-low p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-primary/70">
            {t("profile.stats.totalCo2")}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-extrabold tracking-tighter text-text">
              {stats.totalCo2SavedKg.toFixed(1)}
            </span>
            <span className="text-xl font-bold uppercase text-text-dim">
              {t("profile.stats.kgUnit")}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-surface-low p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
            {t("profile.stats.distance")}
          </p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text">
              {Math.round(stats.totalDistanceKm)}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {t("profile.stats.kmUnit")}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-surface-low p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
            {t("profile.stats.trips")}
          </p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text">{stats.tripCount}</span>
          </div>
        </div>
        <div className="rounded-lg bg-surface-low p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
            {t("profile.stats.fuel")}
          </p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text">{stats.totalFuelSavedL.toFixed(1)}</span>
            <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {t("profile.stats.litersUnit")}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-surface-low p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
            {t("profile.stats.saved")}
          </p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text">
              {stats.totalMoneySavedEur.toFixed(2)}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {t("profile.stats.eurUnit")}
            </span>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4 rounded-lg bg-surface-low px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Droplets size={20} className="text-primary-light" />
        </div>
        {fuelPriceLoading ? (
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-surface-high" />
            <div className="h-3 w-32 animate-pulse rounded bg-surface-high" />
          </div>
        ) : fuelPrice ? (
          <div className="flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-text">
                {fuelPrice.priceEur.toFixed(2)} &euro;/L
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
                {fuelPrice.fuelType.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-text-muted">
              {fuelPrice.stationName ? fuelPrice.stationName : t("profile.fuel.nationalAverage")}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
