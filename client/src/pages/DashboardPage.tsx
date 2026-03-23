import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Bike, Leaf, MapPin, ChevronRight, Car, X, CloudOff, Euro, Route } from "lucide-react";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { useDashboardSummary, useProfile } from "@/hooks/queries";
import { getPendingTrips } from "@/lib/offline-queue";
import appLogo from "/pwa-192x192.png?url";

interface Milestone {
  value: number;
  label: string;
}

const MONEY_MILESTONES: Milestone[] = [
  { value: 5, label: "Un café offert" },
  { value: 10, label: "Une place de ciné" },
  { value: 20, label: "Un resto" },
  { value: 50, label: "Un plein gratuit" },
  { value: 100, label: "Un weekend" },
  { value: 200, label: "Un vélo neuf" },
  { value: 500, label: "Des vacances" },
  { value: 1000, label: "Millionnaire vert" },
];

const KM_MILESTONES: Milestone[] = [
  { value: 10, label: "Première vraie balade" },
  { value: 50, label: "Paris \u2192 Versailles" },
  { value: 100, label: "Paris \u2192 Chartres" },
  { value: 500, label: "Paris \u2192 Lyon" },
  { value: 1000, label: "Paris \u2192 Barcelone" },
  { value: 5000, label: "Paris \u2192 Moscou" },
  { value: 10000, label: "Tour de France" },
];

const CO2_MILESTONES: Milestone[] = [
  { value: 1, label: "Un aller-retour CDG" },
  { value: 10, label: "1h d\u2019avion \u00e9vit\u00e9e" },
  { value: 50, label: "Paris \u2192 Bordeaux" },
  { value: 100, label: "Paris \u2192 Marseille" },
  { value: 500, label: "Un vol transatlantique" },
  { value: 1000, label: "1 tonne de CO\u2082 !" },
];

function getNextMilestone(current: number, milestones: Milestone[]) {
  const next = milestones.find((m) => m.value > current);
  if (!next) {
    const last = milestones[milestones.length - 1]!;
    return { target: last.value, label: last.label, progress: 1 };
  }
  const prev = milestones.filter((m) => m.value <= current).pop();
  const base = prev?.value ?? 0;
  const progress = (current - base) / (next.value - base);
  return { target: next.value, label: next.label, progress: Math.min(progress, 1) };
}

export function DashboardPage() {
  const { data: today, isPending: todayPending } = useDashboardSummary("day");
  const { data: allTime, isPending: allTimePending } = useDashboardSummary("all");
  const { data: profileData } = useProfile();
  const [vehiclePromptDismissed, setVehiclePromptDismissed] = useState(false);
  const pendingTrips = getPendingTrips();

  const isPending = todayPending || allTimePending;

  // MUST be before any early return to respect Rules of Hooks
  const milestones = useMemo(
    () =>
      allTime
        ? [
            {
              key: "eur",
              icon: <Euro size={16} className="text-primary-light" />,
              current: allTime.totalMoneySavedEur,
              unit: "€",
              ...getNextMilestone(allTime.totalMoneySavedEur, MONEY_MILESTONES),
            },
            {
              key: "km",
              icon: <Route size={16} className="text-primary-light" />,
              current: allTime.totalDistanceKm,
              unit: "km",
              ...getNextMilestone(allTime.totalDistanceKm, KM_MILESTONES),
            },
            {
              key: "co2",
              icon: <Leaf size={16} className="text-primary-light" />,
              current: allTime.totalCo2SavedKg,
              unit: "kg",
              ...getNextMilestone(allTime.totalCo2SavedKg, CO2_MILESTONES),
            },
          ]
        : [],
    [allTime],
  );

  if (isPending || !today || !allTime) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label="Chargement"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isNewUser = allTime.tripCount === 0;

  return (
    <>
      {/* Header */}
      <header
        role="banner"
        className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl"
      >
        <span className="text-2xl font-black tracking-tighter">
          <span className="text-text">eco</span>
          <span className="text-primary-light">Ride</span>
        </span>
      </header>

      {/* Offline pending trips banner */}
      {pendingTrips.length > 0 && (
        <div className="mx-6 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
          <CloudOff size={18} className="shrink-0 text-primary-light" />
          <span className="flex-1 text-xs font-medium text-text">
            {pendingTrips.length} trajet{pendingTrips.length > 1 ? "s" : ""} en attente de
            synchronisation
          </span>
        </div>
      )}

      {isNewUser ? (
        /* ---- Empty state: first-time user ---- */
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <img src={appLogo} alt="ecoRide" className="h-20 w-20 rounded-2xl" />
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-bold">
              Bienvenue sur <span className="text-text">eco</span>
              <span className="text-primary-light">Ride</span> !
            </h2>
            <p className="max-w-xs text-sm text-text-muted">
              Enregistrez votre premier trajet vélo pour commencer à suivre vos économies CO₂.
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
                <span className="block text-lg font-black text-bg">Démarrer un trajet</span>
                <span className="block text-sm font-medium text-bg/70">GPS ou saisie manuelle</span>
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
                <Link to="/profile" className="flex-1 text-xs font-medium text-text">
                  Configurez votre véhicule de référence pour des calculs CO₂ plus précis
                </Link>
                <button
                  onClick={() => setVehiclePromptDismissed(true)}
                  aria-label="Fermer"
                  className="shrink-0 rounded p-2 text-text-muted hover:text-text"
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
                    <span className="text-2xl font-black text-text">{today.tripCount}</span>
                  </div>
                  <span className="text-xs font-bold uppercase text-text-muted">
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
                  <span className="text-xs font-bold uppercase text-text-muted">km</span>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1">
                    <Leaf size={14} className="text-primary-light" />
                    <span className="text-2xl font-black text-text">
                      {today.totalCo2SavedKg.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-xs font-bold uppercase text-text-muted">kg CO₂</span>
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

          {/* Progressive Milestones */}
          <section className="space-y-3" data-testid="milestones">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              Prochains objectifs
            </h3>
            {milestones.map((m) => (
              <div key={m.key} className="rounded-xl bg-surface-container p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {m.icon}
                    <span className="text-xs font-bold text-text-muted">{m.label}</span>
                  </div>
                  <span className="text-xs font-bold text-primary-light">
                    {m.current < m.target
                      ? `${Math.round(m.current)} / ${m.target} ${m.unit}`
                      : `${m.target} ${m.unit}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.max(m.progress * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </section>

          {/* Impact Meter (all-time) */}
          <ImpactMeter co2TotalKg={allTime.totalCo2SavedKg} />
        </div>
      )}
    </>
  );
}
