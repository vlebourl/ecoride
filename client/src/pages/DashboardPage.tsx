import { useState } from "react";
import { Link } from "react-router";
import { Bike, Leaf, Euro, TrendingUp, Trash2, X } from "lucide-react";
import { PeriodSwitcher } from "@/components/ui/PeriodSwitcher";
import { StatCard } from "@/components/ui/StatCard";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { useDashboardSummary, useTrips, useDeleteTrip } from "@/hooks/queries";
import type { StatsPeriod } from "@ecoride/shared/api-contracts";
import type { Trip } from "@ecoride/shared/types";

type Period = "day" | "week" | "month";

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const { data: s, isPending } = useDashboardSummary(period as StatsPeriod);
  const { data: tripsData } = useTrips(1, 5);
  const deleteTrip = useDeleteTrip();

  const recentTrips = tripsData?.trips ?? [];

  if (isPending || !s) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const hasNoTrips = s.tripCount === 0;

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl">
        <span className="text-2xl font-black tracking-tighter">
          <span className="text-text">eco</span><span className="text-primary-light">Ride</span>
        </span>
      </header>

      {hasNoTrips ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <img src="/pwa-192x192.png" alt="ecoRide" className="h-20 w-20 rounded-2xl" />
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-bold">
              Bienvenue sur{" "}
              <span className="text-text">eco</span>
              <span className="text-primary-light">Ride</span> !
            </h2>
            <p className="max-w-xs text-sm text-text-muted">
              Enregistrez votre premier trajet vélo pour commencer à suivre vos économies CO₂.
            </p>
          </div>
          <Link
            to="/trip"
            className="mt-2 rounded-xl bg-primary px-8 py-3 text-sm font-bold text-bg transition-colors hover:bg-primary-light"
          >
            Démarrer un trajet
          </Link>
        </div>
      ) : (
      <div className="flex flex-col gap-6 px-6 pb-6">
        {/* Period Switcher */}
        <PeriodSwitcher value={period} onChange={setPeriod} />

        {/* Stat Cards Row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={Bike} value={s.totalDistanceKm.toFixed(1)} unit="km" />
          <StatCard icon={Leaf} value={s.totalCo2SavedKg.toFixed(1)} unit="kg CO₂" />
          <StatCard icon={Euro} value={s.totalMoneySavedEur.toFixed(2)} unit="€" />
        </div>

        {/* Comparison Card */}
        <div className="flex items-center justify-between rounded-xl bg-surface-container p-5">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">
              Économie Mensuelle
            </span>
            <span className="mt-1 text-xl font-black">
              {s.totalMoneySavedEur.toFixed(0)}€{" "}
              <span className="text-sm font-medium text-text-muted">
                économisés
              </span>
            </span>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp size={20} className="text-primary-light" />
          </div>
        </div>

        {/* Impact Meter */}
        <ImpactMeter co2TotalKg={s.totalCo2SavedKg} />

        {/* Streak + Goal */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <span className="text-sm font-black uppercase tracking-wider text-text">
                {s.currentStreak} jours consécutifs
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-xl bg-surface-container p-5">
            <div className="flex items-end justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-text-muted">
                Objectif mensuel
              </span>
              <span className="text-lg font-black">
                {Math.round(s.totalDistanceKm)}
                <span className="text-sm font-medium text-text-muted">
                  /100 km
                </span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-highest">
              <div
                className="h-full rounded-full bg-primary-light"
                style={{ width: `${Math.min(s.totalDistanceKm, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Recent Trips */}
        {recentTrips.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
                Derniers trajets
              </h3>
              <Link to="/stats" className="text-xs font-bold text-primary-light">
                Tout voir
              </Link>
            </div>
            {recentTrips.map((trip) => (
              <button
                key={trip.id}
                onClick={() => setSelectedTrip(trip)}
                className="flex w-full items-center justify-between rounded-xl bg-surface-container p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-high">
                    <Bike size={18} className="text-primary-light" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{trip.distanceKm} km</p>
                    <p className="text-[10px] text-text-muted">
                      {new Date(trip.startedAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-primary-light">
                  {trip.co2SavedKg.toFixed(1)} kg CO₂
                </span>
              </button>
            ))}
          </section>
        )}
      </div>
      )}

      {/* Bottom sheet — trip detail / delete */}
      {selectedTrip && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          onClick={() => setSelectedTrip(null)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg rounded-t-2xl bg-surface-container p-6 pb-10 animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-highest" />
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">Trajet</h3>
                <p className="text-sm text-text-muted">
                  {new Date(selectedTrip.startedAt).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedTrip(null)}
                className="rounded-lg p-2 text-text-muted active:bg-surface-high"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mb-6 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xl font-bold text-primary-light">{selectedTrip.distanceKm}</p>
                <p className="text-[10px] font-bold uppercase text-text-muted">km</p>
              </div>
              <div>
                <p className="text-xl font-bold text-primary-light">{selectedTrip.co2SavedKg.toFixed(1)}</p>
                <p className="text-[10px] font-bold uppercase text-text-muted">kg CO₂</p>
              </div>
              <div>
                <p className="text-xl font-bold text-primary-light">{selectedTrip.moneySavedEur.toFixed(2)}</p>
                <p className="text-[10px] font-bold uppercase text-text-muted">€</p>
              </div>
            </div>
            <button
              onClick={() => {
                deleteTrip.mutate(selectedTrip.id, {
                  onSuccess: () => setSelectedTrip(null),
                });
              }}
              disabled={deleteTrip.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-danger/10 py-3 text-sm font-bold text-danger active:scale-95 disabled:opacity-50"
            >
              <Trash2 size={16} />
              {deleteTrip.isPending ? "Suppression..." : "Supprimer ce trajet"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
