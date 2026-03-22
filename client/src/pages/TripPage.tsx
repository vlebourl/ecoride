import { useState, useEffect, useRef } from "react";
import { Play, Square, Keyboard, AlertTriangle, RotateCcw } from "lucide-react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { useCreateTrip, useProfile } from "@/hooks/queries";
import { CO2_KG_PER_LITER } from "@ecoride/shared/types";
import { useGpsTracking } from "@/hooks/useGpsTracking";
import type { TrackingSession } from "@/hooks/useGpsTracking";

type TripState = "idle" | "tracking" | "stopped" | "manual";

const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522]; // Paris

function RecenterMap({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom(), { animate: true });
  }, [map, position]);
  return null;
}

export function TripPage() {
  const [uiState, setUiState] = useState<TripState>("idle");
  const [manualKm, setManualKm] = useState("");
  const [saveError, setSaveError] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [initialPos, setInitialPos] = useState<[number, number]>(DEFAULT_CENTER);
  const sessionRef = useRef<TrackingSession | null>(null);
  const createTrip = useCreateTrip();
  const { data: profileData } = useProfile();
  const gps = useGpsTracking();

  // Get user's real position on page load (one-shot)
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setInitialPos([pos.coords.latitude, pos.coords.longitude]),
      () => {}, // silent fail — keep DEFAULT_CENTER
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  // Derive map data from GPS state
  const positions: [number, number][] = gps.state.gpsPoints.map((p) => [p.lat, p.lng]);
  const lastPos = positions.length > 0 ? positions[positions.length - 1] : undefined;
  const currentPos: [number, number] = lastPos ?? initialPos;

  const distance = uiState === "stopped" && sessionRef.current
    ? sessionRef.current.distanceKm
    : gps.state.distanceKm;
  const elapsed = uiState === "stopped" && sessionRef.current
    ? sessionRef.current.durationSec
    : gps.state.durationSec;

  const startTracking = () => {
    sessionRef.current = null;
    gps.start();
    setUiState("tracking");
  };

  const stopTracking = () => {
    const session = gps.stop();
    sessionRef.current = session;
    setUiState("stopped");
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const consumptionL100 = profileData?.user.consumptionL100 ?? 7; // Default 7 L/100km (matches server)
  const co2Saved = distance * (consumptionL100 / 100) * CO2_KG_PER_LITER;

  const handleSaveTrip = (km: number, durationSec: number, session?: TrackingSession | null) => {
    setSaveError("");
    const endedAt = session?.endedAt ?? new Date().toISOString();
    const startedAt = session?.startedAt ?? new Date(new Date(endedAt).getTime() - durationSec * 1000).toISOString();
    createTrip.mutate(
      {
        distanceKm: Math.round(km * 100) / 100,
        durationSec,
        startedAt,
        endedAt,
        gpsPoints: session?.gpsPoints?.length ? session.gpsPoints : null,
      },
      {
        onSuccess: () => {
          setSaveError("");
          setUiState("idle");
          setManualKm("");
          setManualMinutes("");
          sessionRef.current = null;
          gps.reset();
        },
        onError: () => {
          setSaveError("Impossible d'enregistrer le trajet. Vérifiez votre connexion.");
        },
      },
    );
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <header role="banner" className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl">
        <span className="text-lg font-bold tracking-tight">
          <span className="text-text">eco</span><span className="text-primary-light">Ride</span>
        </span>
      </header>

      {/* GPS Error banner */}
      {gps.state.error && (
        <div className="z-50 flex items-center gap-3 bg-danger/20 px-6 py-3">
          <AlertTriangle size={16} className="shrink-0 text-danger" />
          <span className="text-sm font-medium text-danger">{gps.state.error}</span>
        </div>
      )}

      {/* Map */}
      <div className="relative flex-1">
        <MapContainer
          center={currentPos as LatLngExpression}
          zoom={15}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
          style={{ background: "#232d35" }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {positions.length > 1 && (
            <Polyline
              positions={positions as LatLngExpression[]}
              pathOptions={{ color: "#2ecc71", weight: 4, opacity: 0.9 }}
            />
          )}
          <CircleMarker
            center={currentPos as LatLngExpression}
            radius={8}
            pathOptions={{
              fillColor: "#2ecc71",
              fillOpacity: 1,
              color: "#ffffff",
              weight: 2,
            }}
          />
          <RecenterMap position={currentPos} />
        </MapContainer>

        {/* Floating CO2 chip */}
        {uiState === "tracking" && (
          <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-full border border-primary/30 bg-primary/20 px-5 py-2.5 backdrop-blur-md">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                CO₂ Saved
              </span>
              <span className="text-xl font-extrabold text-primary-light">
                {co2Saved.toFixed(1)} kg
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stats overlay */}
      {uiState === "tracking" && (
        <div className="space-y-4 px-6 pb-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-outline-variant/10 bg-surface-low/80 p-6 backdrop-blur-2xl">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim">
                Distance
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tighter text-text">
                  {distance.toFixed(1)}
                </span>
                <span className="text-sm font-medium text-text-dim">km</span>
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant/10 bg-surface-low/80 p-6 backdrop-blur-2xl">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim">
                Temps
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tighter text-primary-light">
                  {formatTime(elapsed)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stopped summary */}
      {uiState === "stopped" && (
        <div className="space-y-4 px-6 pb-4">
          <div className="rounded-xl bg-surface-container p-6">
            <h2 className="mb-4 text-lg font-bold">Trajet terminé</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-black text-primary-light">
                  {distance.toFixed(1)}
                </div>
                <div className="text-[10px] font-bold uppercase text-text-muted">km</div>
              </div>
              <div>
                <div className="text-2xl font-black text-primary-light">
                  {co2Saved.toFixed(1)}
                </div>
                <div className="text-[10px] font-bold uppercase text-text-muted">
                  kg CO₂
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-primary-light">
                  {formatTime(elapsed)}
                </div>
                <div className="text-[10px] font-bold uppercase text-text-muted">
                  durée
                </div>
              </div>
            </div>
            <button
              onClick={() => handleSaveTrip(distance, elapsed, sessionRef.current)}
              disabled={createTrip.isPending}
              className="mt-6 w-full rounded-xl bg-primary py-4 text-sm font-black uppercase tracking-widest text-bg active:scale-95 disabled:opacity-50"
            >
              {createTrip.isPending ? "Enregistrement..." : "Enregistrer"}
            </button>
            {saveError && (
              <div className="mt-4 rounded-xl bg-danger/10 p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={16} className="shrink-0 text-danger" />
                  <span className="text-sm font-medium text-danger">{saveError}</span>
                </div>
                <button
                  onClick={() => handleSaveTrip(distance, elapsed, sessionRef.current)}
                  disabled={createTrip.isPending}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-danger/20 py-3 text-sm font-bold text-danger active:scale-95 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Réessayer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual entry */}
      {uiState === "manual" && (
        <div className="space-y-4 px-6 pb-4">
          <div className="rounded-xl bg-surface-container p-6">
            <h2 className="mb-4 text-lg font-bold">Saisie manuelle</h2>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted">
              Distance (km)
            </label>
            <input
              type="number"
              value={manualKm}
              onChange={(e) => setManualKm(e.target.value)}
              placeholder="0.0"
              className="mb-4 w-full rounded-lg bg-surface-high p-4 text-2xl font-bold text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted">
              Durée (minutes)
            </label>
            <input
              type="number"
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
              placeholder="Optionnel"
              className="mb-4 w-full rounded-lg bg-surface-high p-4 text-2xl font-bold text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setUiState("idle")}
                className="flex-1 rounded-xl bg-surface-high py-4 text-sm font-bold text-text-muted active:scale-95"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  const km = parseFloat(manualKm);
                  if (km > 0) {
                    const durationSec = manualMinutes
                      ? parseInt(manualMinutes) * 60
                      : Math.round((km / 15) * 3600); // Fallback: estimate ~15 km/h
                    handleSaveTrip(km, durationSec);
                  }
                }}
                disabled={createTrip.isPending || !manualKm || parseFloat(manualKm) <= 0}
                className="flex-1 rounded-xl bg-primary py-4 text-sm font-black uppercase tracking-widest text-bg active:scale-95 disabled:opacity-50"
              >
                {createTrip.isPending ? "..." : "Enregistrer"}
              </button>
            </div>
            {saveError && (
              <div className="mt-4 rounded-xl bg-danger/10 p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={16} className="shrink-0 text-danger" />
                  <span className="text-sm font-medium text-danger">{saveError}</span>
                </div>
                <button
                  onClick={() => {
                    const km = parseFloat(manualKm);
                    if (km > 0) {
                      const estimatedDuration = Math.round((km / 15) * 3600);
                      handleSaveTrip(km, estimatedDuration);
                    }
                  }}
                  disabled={createTrip.isPending}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-danger/20 py-3 text-sm font-bold text-danger active:scale-95 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Réessayer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {uiState === "idle" && (
        <div className="space-y-3 px-6 pb-6">
          <button
            onClick={startTracking}
            className="flex w-full items-center justify-center gap-4 rounded-xl bg-primary py-6 shadow-[0px_20px_40px_rgba(0,0,0,0.4)] active:scale-95"
          >
            <Play size={28} className="text-bg" fill="currentColor" />
            <span className="text-xl font-black uppercase tracking-widest text-bg">
              Démarrer
            </span>
          </button>
          <button
            onClick={() => setUiState("manual")}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-surface-container py-4 active:scale-95"
          >
            <Keyboard size={18} className="text-text-muted" />
            <span className="text-sm font-bold text-text-muted">
              Saisie manuelle
            </span>
          </button>
        </div>
      )}

      {uiState === "tracking" && (
        <div className="px-6 pb-6">
          <button
            onClick={stopTracking}
            className="flex w-full items-center justify-center gap-4 rounded-xl bg-danger py-6 shadow-[0px_20px_40px_rgba(0,0,0,0.4)] active:scale-95"
          >
            <Square size={28} className="text-text" fill="currentColor" />
            <span className="text-xl font-black uppercase tracking-widest text-text">
              Terminer
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
