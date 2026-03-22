import { useState } from "react";
import { Bike } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BADGES } from "@ecoride/shared/types";
import type { BadgeId } from "@ecoride/shared/types";
import { useDashboardSummary, useTrips, useAchievements } from "@/hooks/queries";

type Period = "week" | "month" | "year";
type Metric = "km" | "co2" | "eur";

const periodLabels: Record<Period, string> = {
  week: "Semaine",
  month: "Mois",
  year: "Année",
};

const metricLabels: Record<Metric, string> = {
  km: "Distance (km)",
  co2: "CO₂ (kg)",
  eur: "Économies (€)",
};

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

const allBadgeIds = Object.keys(BADGES) as BadgeId[];

export function StatsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [metric, setMetric] = useState<Metric>("km");
  const { data: s, isPending: summaryLoading } = useDashboardSummary("month");
  const { data: tripsData, isPending: tripsLoading } = useTrips(1, 10);
  const { data: achievements, isPending: achievementsLoading } = useAchievements();

  const isPending = summaryLoading || tripsLoading || achievementsLoading;

  if (isPending || !s) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const trips = tripsData?.trips ?? [];

  // Build weekly chart data from recent trips
  const weeklyData = DAY_LABELS.map((day) => ({ day, km: 0, co2: 0, eur: 0 }));
  const now = new Date();
  const mondayStart = new Date(now);
  mondayStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  mondayStart.setHours(0, 0, 0, 0);

  for (const trip of trips) {
    const tripDate = new Date(trip.startedAt);
    if (tripDate >= mondayStart) {
      const dayIdx = (tripDate.getDay() + 6) % 7; // Mon=0, Sun=6
      if (weeklyData[dayIdx]) {
        weeklyData[dayIdx].km += trip.distanceKm;
        weeklyData[dayIdx].co2 += trip.co2SavedKg;
        weeklyData[dayIdx].eur += trip.moneySavedEur;
      }
    }
  }

  // Round values for display
  for (const d of weeklyData) {
    d.km = Math.round(d.km * 10) / 10;
    d.co2 = Math.round(d.co2 * 10) / 10;
    d.eur = Math.round(d.eur * 100) / 100;
  }

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl">
        <span className="text-lg font-bold tracking-tight text-primary-light">
          Stats
        </span>
        <span className="text-xl font-bold tracking-tighter">
          <span className="text-text">eco</span><span className="text-primary-light">Ride</span>
        </span>
      </header>

      <div className="space-y-12 px-6 pb-6">
        {/* Monthly Totals */}
        <section className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Ce mois
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight">
                {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Distance highlight */}
            <div className="col-span-1 flex min-h-[160px] flex-col justify-between rounded-xl border border-outline-variant/10 bg-surface-low p-6 md:col-span-2">
              <div className="flex items-start justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                  Distance Totale
                </span>
                <Bike size={22} className="text-primary-light" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-bold tracking-tighter">
                  {Math.round(s.totalDistanceKm)}
                </span>
                <span className="text-xl font-bold text-on-surface-variant">
                  KM
                </span>
              </div>
            </div>

            {/* CO2 */}
            <div className="flex flex-col gap-4 rounded-xl border border-outline-variant/10 bg-surface-low p-6">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                CO₂ Économisé
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tighter">
                  {Math.round(s.totalCo2SavedKg)}
                </span>
                <span className="text-base font-bold text-primary-light">
                  KG
                </span>
              </div>
            </div>

            {/* Money */}
            <div className="flex flex-col gap-4 rounded-xl border border-outline-variant/10 bg-surface-low p-6">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Économies
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tighter">
                  {Math.round(s.totalMoneySavedEur)}
                </span>
                <span className="text-base font-bold text-primary-light">
                  €
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Chart Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
              Évolution
            </h3>
          </div>

          {/* Period switcher */}
          <nav className="flex items-center border-b border-surface-low">
            {(Object.keys(periodLabels) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  p === period
                    ? "border-b-2 border-primary-light font-bold text-primary-light"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </nav>

          {/* Metric switcher */}
          <div className="flex gap-2">
            {(Object.keys(metricLabels) as Metric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  m === metric
                    ? "bg-primary/20 text-primary-light"
                    : "bg-surface-high text-text-muted"
                }`}
              >
                {m === "km" ? "KM" : m === "co2" ? "CO₂" : "€"}
              </button>
            ))}
          </div>

          {/* Line Chart */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-low p-4">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyData}>
                <CartesianGrid stroke="#2e3842" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#8a9ba8", fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#283240",
                    border: "1px solid #333e47",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#8a9ba8", fontWeight: 600 }}
                  itemStyle={{ color: "#2ecc71" }}
                  formatter={(value) => [
                    `${Number(value).toFixed(1)} ${metric === "km" ? "km" : metric === "co2" ? "kg" : "€"}`,
                    metricLabels[metric],
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke="#2ecc71"
                  strokeWidth={2.5}
                  dot={{ fill: "#2ecc71", r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#54e98a", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Recent Activity */}
        <section className="space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
            Activité récente
          </h3>
          <div className="space-y-3">
            {trips.length === 0 && (
              <p className="text-center text-sm text-text-muted">Aucun trajet enregistré</p>
            )}
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="flex items-center justify-between rounded-xl border border-outline-variant/5 bg-surface-low p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-high">
                    <Bike size={20} className="text-primary-light" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Trajet</p>
                    <p className="text-[10px] font-medium text-on-surface-variant">
                      {new Date(trip.startedAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary-light">
                    +{trip.distanceKm} KM
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-tighter text-on-surface-variant">
                    {trip.co2SavedKg.toFixed(1)} KG CO₂
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Badges */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
            Badges
          </h3>
          <div className="grid grid-cols-4 gap-4">
            {allBadgeIds.map((id) => {
              const badge = BADGES[id];
              const unlocked = (achievements ?? []).some(
                (a) => a.badgeId === id,
              );
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
      </div>
    </>
  );
}
