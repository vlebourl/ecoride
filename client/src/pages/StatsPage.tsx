import { useState } from "react";
import { Bike, BarChart3, Trash2, X } from "lucide-react";
import type { Trip } from "@ecoride/shared/types";
import {
  LineChart,
  Line,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import type { LatLngTuple, LatLngBoundsExpression } from "leaflet";
import L from "leaflet";
import { BADGES } from "@ecoride/shared/types";
import type { BadgeId } from "@ecoride/shared/types";
import { useDashboardSummary, useTrips, useTrip, useWeeklyTrips, useAchievements, useDeleteTrip } from "@/hooks/queries";

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

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  map.fitBounds(bounds, { padding: [20, 20] });
  return null;
}

function TripMiniMap({ gpsPoints }: { gpsPoints: { lat: number; lng: number }[] }) {
  const positions: LatLngTuple[] = gpsPoints.map((p) => [p.lat, p.lng]);
  const bounds = L.latLngBounds(positions);

  return (
    <div className="mb-4 h-48 rounded-xl overflow-hidden">
      <MapContainer
        center={bounds.getCenter()}
        zoom={13}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        className="h-full w-full"
        style={{ background: "#232d35" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <Polyline
          positions={positions}
          pathOptions={{ color: "#2ecc71", weight: 4, opacity: 0.9 }}
        />
        <FitBounds bounds={bounds} />
      </MapContainer>
    </div>
  );
}

export function StatsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [metric, setMetric] = useState<Metric>("km");
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const { data: s, isPending: summaryLoading } = useDashboardSummary("month");
  const { data: tripsData, isPending: tripsLoading } = useTrips(1, 10);
  const { data: weeklyTrips, isPending: weeklyLoading } = useWeeklyTrips();
  const { data: achievements, isPending: achievementsLoading } = useAchievements();
  const { data: tripDetail } = useTrip(selectedTrip?.id ?? null);
  const deleteTrip = useDeleteTrip();

  // Use detailed trip data (with gpsPoints) when available, otherwise fall back to list data
  const displayTrip = tripDetail ?? selectedTrip;
  const gpsPoints = displayTrip?.gpsPoints;
  const hasGpsTrack = Array.isArray(gpsPoints) && gpsPoints.length > 1;

  const isPending = summaryLoading || tripsLoading || weeklyLoading || achievementsLoading;

  if (isPending || !s) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const trips = tripsData?.trips ?? [];
  const chartTrips = weeklyTrips ?? [];

  // Build weekly chart data from all trips this week
  const weeklyData = DAY_LABELS.map((day) => ({ day, km: 0, co2: 0, eur: 0 }));

  for (const trip of chartTrips) {
    const tripDate = new Date(trip.startedAt);
    const dayIdx = (tripDate.getDay() + 6) % 7; // Mon=0, Sun=6
    if (weeklyData[dayIdx]) {
      weeklyData[dayIdx].km += trip.distanceKm;
      weeklyData[dayIdx].co2 += trip.co2SavedKg;
      weeklyData[dayIdx].eur += trip.moneySavedEur;
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
        {s.tripCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <BarChart3 size={40} className="text-primary-light" />
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <h3 className="text-xl font-bold">Pas encore de statistiques</h3>
              <p className="max-w-xs text-sm text-text-muted">
                Vos données apparaîtront ici après votre premier trajet.
              </p>
            </div>
          </div>
        ) : (
        <>
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
              <button
                key={trip.id}
                onClick={() => setSelectedTrip(trip)}
                className="flex w-full items-center justify-between rounded-xl border border-outline-variant/5 bg-surface-low p-4 text-left active:scale-[0.98] transition-transform"
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
              </button>
            ))}
          </div>
        </section>
        </>
        )}

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

      {/* Bottom sheet — trip detail / delete */}
      {selectedTrip && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          onClick={() => setSelectedTrip(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Sheet */}
          <div
            className="relative w-full max-w-lg rounded-t-2xl bg-surface-container p-6 pb-10 animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-highest" />

            {/* Header */}
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

            {/* GPS Track Map */}
            {hasGpsTrack && <TripMiniMap gpsPoints={gpsPoints} />}

            {/* Manual entry label */}
            {!hasGpsTrack && (
              <p className="mb-4 text-center text-xs text-text-dim">Saisie manuelle</p>
            )}

            {/* Stats */}
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

            {/* Delete button */}
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
