import { useState } from "react";
import {
  User as UserIcon,
  Bike,
  Bell,
  Shield,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { mockUser, mockSummary, mockAchievements, allBadgeIds } from "@/lib/mock-data";
import { BADGES, FUEL_TYPES } from "@ecoride/shared/types";
import type { FuelType } from "@ecoride/shared/types";

export function ProfilePage() {
  const user = mockUser;
  const s = mockSummary;
  const [showVehicle, setShowVehicle] = useState(false);
  const [vehicleModel, setVehicleModel] = useState(user.vehicleModel ?? "");
  const [fuelType, setFuelType] = useState<FuelType>(user.fuelType ?? "sp95");
  const [consumption, setConsumption] = useState(
    String(user.consumptionL100 ?? ""),
  );

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl">
        <span className="text-xl font-bold tracking-tighter text-primary-light">
          EcoRide
        </span>
      </header>

      <div className="space-y-8 px-6 pb-6">
        {/* User Identity Hero */}
        <section className="flex flex-col items-center space-y-4 text-center">
          <div className="relative">
            <div className="rounded-full bg-gradient-to-tr from-primary to-primary-dark p-1">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface">
                <span className="text-4xl font-bold text-primary-light">
                  {user.name.charAt(0)}
                </span>
              </div>
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text">
              {user.name}
            </h1>
            <div className="mt-1 inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-light">
              Eco Rider
            </div>
          </div>
        </section>

        {/* Stats Bento Grid */}
        <section className="grid grid-cols-2 gap-4">
          <div className="group relative col-span-2 overflow-hidden rounded-lg bg-surface-low p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
              Total CO₂ Économisé
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tracking-tighter text-text">
                {s.totalCo2SavedKg.toFixed(1)}
              </span>
              <span className="text-xl font-bold uppercase text-text-dim">
                kg
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Distance
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                {Math.round(s.totalDistanceKm)}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
                km
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-dim">
              Trajets
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                {s.tripCount}
              </span>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold tracking-tight">Badges</h2>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {allBadgeIds.slice(0, 4).map((id) => {
              const badge = BADGES[id];
              const unlocked = mockAchievements.some((a) => a.badgeId === id);
              return (
                <div
                  key={id}
                  className={`flex flex-col items-center gap-2 ${
                    !unlocked ? "opacity-40" : ""
                  }`}
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                      unlocked
                        ? "bg-primary/10 text-primary-light"
                        : "bg-surface-high text-text-dim"
                    }`}
                  >
                    <span className="text-2xl">{badge.icon}</span>
                  </div>
                  <span className="text-center text-[10px] font-bold uppercase leading-tight text-text-muted">
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Vehicle Form (collapsible) */}
        {showVehicle && (
          <section className="space-y-4 rounded-xl bg-surface-low p-6">
            <h2 className="text-lg font-bold tracking-tight">
              Véhicule de référence
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  Modèle
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  Carburant
                </label>
                <select
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value as FuelType)}
                  className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {FUEL_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  Consommation (L/100km)
                </label>
                <input
                  type="number"
                  value={consumption}
                  onChange={(e) => setConsumption(e.target.value)}
                  className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <button className="w-full rounded-xl bg-primary py-3 text-sm font-black uppercase tracking-widest text-bg active:scale-95">
              Enregistrer
            </button>
          </section>
        )}

        {/* Settings List */}
        <section className="space-y-2">
          <h2 className="mb-4 text-lg font-bold tracking-tight">Paramètres</h2>
          <div className="overflow-hidden rounded-lg bg-surface-low">
            {[
              { icon: UserIcon, label: "Informations personnelles" },
              {
                icon: Bike,
                label: "Mon véhicule",
                onClick: () => setShowVehicle(!showVehicle),
              },
              { icon: Bell, label: "Notifications" },
              { icon: Shield, label: "Confidentialité" },
            ].map(({ icon: Icon, label, onClick }, i) => (
              <div key={label}>
                {i > 0 && <div className="mx-4 h-px bg-white/5" />}
                <button
                  onClick={onClick}
                  className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
                >
                  <div className="flex items-center gap-4">
                    <Icon size={20} className="text-text-muted" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <ChevronRight size={18} className="text-text-dim" />
                </button>
              </div>
            ))}
          </div>

          <button className="mt-6 w-full rounded-lg bg-surface-high py-4 text-xs font-bold uppercase tracking-widest text-danger active:scale-95">
            <div className="flex items-center justify-center gap-2">
              <LogOut size={16} />
              Déconnexion
            </div>
          </button>
        </section>
      </div>
    </>
  );
}
