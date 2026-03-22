import { useState } from "react";
import { Link } from "react-router";
import { Bike, Leaf, MapPin, ChevronRight, Car, X } from "lucide-react";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { useDashboardSummary, useProfile } from "@/hooks/queries";
import appLogo from "/pwa-192x192.png?url";

export function DashboardPage() {
  const { data: today, isPending: todayPending } = useDashboardSummary("day");
  const { data: allTime, isPending: allTimePending } = useDashboardSummary("all");
  const { data: profileData } = useProfile();
  const [vehiclePromptDismissed, setVehiclePromptDismissed] = useState(false);

  const isPending = todayPending || allTimePending;

  if (isPending || !today || !allTime) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status" aria-label="Chargement">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isNewUser = allTime.tripCount === 0;

  return (
    <>
      {/* Header */}
      <header role="banner" className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl">
        <span className="text-2xl font-black tracking-tighter">
          <span className="text-text">eco</span>
          <span className="text-primary-light">Ride</span>
        </span>
      </header>

      {isNewUser ? (
        /* ---- Empty state: first-time user ---- */
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <img src={appLogo} alt="ecoRide" className="h-20 w-20 rounded-2xl" />
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-bold">
              Bienvenue sur{" "}
              <span className="text-text">eco</span>
              <span className="text-primary-light">Ride</span> !
            </h2>
            <p className="max-w-xs text-sm text-text-muted">
              Enregistrez votre premier trajet vélo pour commencer à suivre vos
              économies CO₂.
            </p>
          </div>
          <Link
            to="/trip"
            className="mt-2 flex items-center gap-3 rounded-xl bg-primary px-8 py-4 text-sm font-bold text-bg transition-colors hover:bg-primary-light active:scale-95"
          >
            <Bike size={20} />
            Démarrer un trajet
          </Link>
        </div>
      ) : (
        /* ---- Main dashboard ---- */
        <div className="flex flex-col gap-6 px-6 pb-6">
          {/* Quick Action CTA */}
          <Link
            to="/trip"
            className="group flex items-center justify-between rounded-2xl bg-primary p-6 shadow-[0_8px_32px_rgba(46,204,113,0.25)] transition-all hover:bg-primary-light active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-bg/20">
                <Bike size={28} className="text-bg" />
              </div>
              <div>
                <span className="block text-lg font-black text-bg">
                  Démarrer un trajet
                </span>
                <span className="block text-sm font-medium text-bg/70">
                  GPS ou saisie manuelle
                </span>
              </div>
            </div>
            <ChevronRight
              size={24}
              className="text-bg/60 transition-transform group-hover:translate-x-1"
            />
          </Link>

          {/* Vehicle onboarding prompt */}
          {!vehiclePromptDismissed &&
            profileData?.user.consumptionL100 == null &&
            allTime.tripCount > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3">
                <Car size={18} className="shrink-0 text-warning" />
                <Link
                  to="/profile"
                  className="flex-1 text-xs font-medium text-text"
                >
                  Configurez votre véhicule de référence pour des calculs CO₂
                  plus précis
                </Link>
                <button
                  onClick={() => setVehiclePromptDismissed(true)}
                  aria-label="Fermer"
                  className="shrink-0 rounded p-1 text-text-muted hover:text-text"
                >
                  <X size={14} />
                </button>
              </div>
            )}

          {/* Today's Summary */}
          <section className="rounded-xl bg-surface-container p-5">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
              Aujourd'hui
            </h3>
            {today.tripCount > 0 ? (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1">
                    <MapPin size={14} className="text-primary-light" />
                    <span className="text-2xl font-black text-text">
                      {today.tripCount}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-text-muted">
                    {today.tripCount > 1 ? "trajets" : "trajet"}
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1">
                    <Bike size={14} className="text-primary-light" />
                    <span className="text-2xl font-black text-text">
                      {today.totalDistanceKm.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-text-muted">
                    km
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1">
                    <Leaf size={14} className="text-primary-light" />
                    <span className="text-2xl font-black text-text">
                      {today.totalCo2SavedKg.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-text-muted">
                    kg CO₂
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-text-muted">
                Pas encore de trajet aujourd'hui — c'est le moment !
              </p>
            )}
          </section>

          {/* Streak */}
          <div className="flex items-center gap-3 rounded-xl bg-surface-container px-5 py-4">
            <span className="text-xl">
              {allTime.currentStreak > 0 ? "\uD83D\uDD25" : "\uD83D\uDEF4"}
            </span>
            <span className="text-sm font-bold text-text">
              {allTime.currentStreak > 0
                ? `${allTime.currentStreak} jour${allTime.currentStreak > 1 ? "s" : ""} consécutif${allTime.currentStreak > 1 ? "s" : ""}`
                : "Commencez votre série !"}
            </span>
          </div>

          {/* Impact Meter (all-time) */}
          <ImpactMeter co2TotalKg={allTime.totalCo2SavedKg} />
        </div>
      )}
    </>
  );
}
