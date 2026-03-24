import { useState, useEffect, useRef } from "react";
import { Play, Square, Keyboard, AlertTriangle, CloudOff, RotateCcw, X } from "lucide-react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { useCreateTrip, useProfile } from "@/hooks/queries";
import { CO2_KG_PER_LITER } from "@ecoride/shared/types";
import { useGpsTracking, getTrackingBackup, clearTrackingBackup } from "@/hooks/useGpsTracking";
import type { TrackingSession, TrackingBackup } from "@/hooks/useGpsTracking";
import { queueTrip } from "@/lib/offline-queue";

type TripState = "idle" | "tracking" | "stopped" | "manual";

const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522]; // Paris

function RecenterMap({ position }: { position: [number, number] }) {
  const map = useMap();
  const lastUpdateRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current < 500) return;
    lastUpdateRef.current = now;
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
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "active" | "denied" | "unavailable">(
    "waiting",
  );
  const [idleAccuracy, setIdleAccuracy] = useState<number | null>(null);
  const [pendingBackup, setPendingBackup] = useState<TrackingBackup | null>(null);
  const sessionRef = useRef<TrackingSession | null>(null);
  const createTrip = useCreateTrip();
  const { data: profileData } = useProfile();
  const gps = useGpsTracking();

  // Fix 1.3: Check for tracking backup on mount
  useEffect(() => {
    const backup = getTrackingBackup();
    if (backup) {
      setPendingBackup(backup);
    }
  }, []);

  // Fix 1.7: Navigation guard — beforeunload for browser close/refresh
  useEffect(() => {
    if (uiState !== "tracking") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uiState]);

  // Fix 1.7: Navigation guard — in-app navigation uses beforeunload above
  // useBlocker removed (not available in react-router v7.13+)

  // Get user's real position on page load + keep watching for idle GPS status
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus("unavailable");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setInitialPos([pos.coords.latitude, pos.coords.longitude]);
        setIdleAccuracy(pos.coords.accuracy);
        setGpsStatus("active");
      },
      (err) => {
        if (err.code === 1) setGpsStatus("denied");
        else setGpsStatus("unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Derive map data from GPS state
  const positions: [number, number][] = gps.state.gpsPoints.map((p) => [p.lat, p.lng]);
  const lastPos = positions.length > 0 ? positions[positions.length - 1] : undefined;
  const currentPos: [number, number] = lastPos ?? initialPos;

  const distance =
    uiState === "stopped" && sessionRef.current
      ? sessionRef.current.distanceKm
      : gps.state.distanceKm;
  const elapsed =
    uiState === "stopped" && sessionRef.current
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

  // Fix 1.3: Restore tracking from backup
  const handleRestore = () => {
    if (!pendingBackup) return;
    gps.restore(pendingBackup);
    setUiState("tracking");
    setPendingBackup(null);
  };

  const handleDismissBackup = () => {
    clearTrackingBackup();
    setPendingBackup(null);
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
    const startedAt =
      session?.startedAt ??
      new Date(new Date(endedAt).getTime() - durationSec * 1000).toISOString();
    const tripData = {
      distanceKm: Math.round(km * 100) / 100,
      durationSec,
      startedAt,
      endedAt,
      gpsPoints: session?.gpsPoints?.length ? session.gpsPoints : null,
    };
    createTrip.mutate(tripData, {
      onSuccess: () => {
        setSaveError("");
        setUiState("idle");
        setManualKm("");
        setManualMinutes("");
        sessionRef.current = null;
        gps.reset();
      },
      onError: () => {
        queueTrip(tripData);
        setSaveError("Trajet sauvegardé hors-ligne. Il sera envoyé automatiquement.");
        // Reset UI to idle after a short delay so the user sees the message
        setTimeout(() => {
          setUiState("idle");
          setManualKm("");
          setManualMinutes("");
          sessionRef.current = null;
          gps.reset();
          setSaveError("");
        }, 3000);
      },
    });
  };

  return (
    <div className="relative flex h-[calc(100dvh_-_6rem)] flex-col">
      {/* Header with persistent GPS indicator */}
      <header
        role="banner"
        className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl"
      >
        <span className="text-lg font-bold tracking-tight">
          <span className="text-text">eco</span>
          <span className="text-primary-light">Ride</span>
        </span>
        {(() => {
          // During tracking, use GPS hook state; otherwise use idle watcher
          const accuracy = uiState === "tracking" ? gps.state.lastAccuracy : idleAccuracy;
          const isActive = uiState === "tracking" ? gps.state.isTracking : gpsStatus === "active";
          const isDenied = gpsStatus === "denied";
          const isUnavailable = gpsStatus === "unavailable";
          const isWaiting = gpsStatus === "waiting" && uiState !== "tracking";

          const color =
            isDenied || isUnavailable
              ? "#FF4D4D"
              : isWaiting
                ? "#9ca3af"
                : !isActive || accuracy == null
                  ? "#9ca3af"
                  : accuracy < 10
                    ? "#2ecc71"
                    : accuracy < 30
                      ? "#FFB800"
                      : "#FF4D4D";

          const label = isDenied
            ? "GPS refusé"
            : isUnavailable
              ? "GPS indisponible"
              : isWaiting
                ? "GPS..."
                : accuracy == null
                  ? "GPS..."
                  : accuracy < 10
                    ? "Précis"
                    : accuracy < 30
                      ? "Moyen"
                      : "Faible";

          return (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-bold text-text-muted">
                {label}
                {isActive && accuracy != null && ` · ${Math.round(accuracy)}m`}
              </span>
            </div>
          );
        })()}
      </header>

      {/* Fix 1.3: Recovery banner for interrupted trip */}
      {pendingBackup && uiState === "idle" && (
        <div className="z-50 flex items-center gap-3 bg-primary/20 px-6 py-3">
          <RotateCcw size={16} className="shrink-0 text-primary-light" />
          <div className="flex-1">
            <span className="text-sm font-medium text-primary-light">
              Un trajet en cours a été interrompu. {pendingBackup.distanceKm.toFixed(1)} km —{" "}
              {formatTime(pendingBackup.durationSec)}
            </span>
          </div>
          <button
            onClick={handleRestore}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg"
          >
            Reprendre
          </button>
          <button
            onClick={handleDismissBackup}
            className="rounded-lg p-1.5 text-primary-light hover:bg-primary/10"
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* GPS Error banner */}
      {gps.state.error && (
        <div className="z-50 flex items-center gap-3 bg-danger/20 px-6 py-3">
          <AlertTriangle size={16} className="shrink-0 text-danger" />
          <span className="text-sm font-medium text-danger">{gps.state.error}</span>
        </div>
      )}

      {/* === TRACKING MODE: dashboard first, map below === */}
      {uiState === "tracking" && (
        <>
          {/* Speed — hero central */}
          <div className="flex flex-col items-center py-6">
            <span className="text-7xl font-black tracking-tighter text-text">
              {gps.state.speedKmh != null ? gps.state.speedKmh.toFixed(0) : "—"}
            </span>
            <span className="text-sm font-bold uppercase tracking-widest text-text-dim">km/h</span>
          </div>

          {/* Distance / CO₂ / Temps — row */}
          <div className="grid grid-cols-3 gap-3 px-6 pb-4">
            <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
              <span className="block text-2xl font-extrabold tracking-tighter text-text">
                {distance.toFixed(1)}
              </span>
              <span className="text-xs font-bold uppercase text-text-dim">km</span>
            </div>
            <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
              <span className="block text-2xl font-extrabold tracking-tighter text-primary-light">
                {co2Saved.toFixed(1)}
              </span>
              <span className="text-xs font-bold uppercase text-text-dim">kg CO₂</span>
            </div>
            <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
              <span className="block text-2xl font-extrabold tracking-tighter text-text">
                {formatTime(elapsed)}
              </span>
              <span className="text-xs font-bold uppercase text-text-dim">temps</span>
            </div>
          </div>

          {/* Mini map */}
          <div className="relative min-h-0 flex-1" data-testid="tracking-map">
            <MapContainer
              center={currentPos as LatLngExpression}
              zoom={15}
              zoomControl={false}
              attributionControl={false}
              className="h-full w-full"
              style={{ background: "#232d35" }}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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
          </div>
        </>
      )}

      {/* === IDLE / STOPPED / MANUAL: full map === */}
      {uiState !== "tracking" && (
        <div className="relative min-h-0 flex-1">
          <MapContainer
            center={currentPos as LatLngExpression}
            zoom={15}
            zoomControl={false}
            attributionControl={false}
            className="h-full w-full"
            style={{ background: "#232d35" }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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
        </div>
      )}

      {/* Stopped summary */}
      {uiState === "stopped" && (
        <div className="space-y-4 px-6 pb-4">
          <div className="rounded-xl bg-surface-container p-6">
            <h2 className="mb-4 text-lg font-bold">Trajet terminé</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-black text-primary-light">{distance.toFixed(1)}</div>
                <div className="text-xs font-bold uppercase text-text-muted">km</div>
              </div>
              <div>
                <div className="text-2xl font-black text-primary-light">{co2Saved.toFixed(1)}</div>
                <div className="text-xs font-bold uppercase text-text-muted">kg CO₂</div>
              </div>
              <div>
                <div className="text-2xl font-black text-primary-light">{formatTime(elapsed)}</div>
                <div className="text-xs font-bold uppercase text-text-muted">durée</div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  if (window.confirm("Abandonner ce trajet ? Les données seront perdues.")) {
                    setUiState("idle");
                    sessionRef.current = null;
                    gps.reset();
                  }
                }}
                disabled={createTrip.isPending}
                className="flex-1 rounded-xl bg-surface-high py-4 text-sm font-bold text-text-muted active:scale-95"
              >
                Abandonner
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Enregistrer ce trajet ?")) {
                    handleSaveTrip(distance, elapsed, sessionRef.current);
                  }
                }}
                disabled={createTrip.isPending}
                className="flex-1 rounded-xl bg-primary py-4 text-sm font-black uppercase tracking-widest text-bg active:scale-95 disabled:opacity-50"
              >
                {createTrip.isPending ? "..." : "Enregistrer"}
              </button>
            </div>
            {saveError && (
              <div className="mt-4 rounded-xl bg-primary/10 p-4">
                <div className="flex items-center gap-3">
                  <CloudOff size={16} className="shrink-0 text-primary-light" />
                  <span className="text-sm font-medium text-primary-light">{saveError}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual entry */}
      {uiState === "manual" && (
        <div className="space-y-4 px-6 pb-4">
          <form
            className="rounded-xl bg-surface-container p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const km = parseFloat(manualKm);
              if (km > 0) {
                const durationSec = manualMinutes
                  ? parseInt(manualMinutes) * 60
                  : Math.round((km / 15) * 3600); // Fallback: estimate ~15 km/h
                handleSaveTrip(km, durationSec);
              }
            }}
          >
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
                type="button"
                onClick={() => setUiState("idle")}
                className="flex-1 rounded-xl bg-surface-high py-4 text-sm font-bold text-text-muted active:scale-95"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={createTrip.isPending || !manualKm || parseFloat(manualKm) <= 0}
                className="flex-1 rounded-xl bg-primary py-4 text-sm font-black uppercase tracking-widest text-bg active:scale-95 disabled:opacity-50"
              >
                {createTrip.isPending ? "..." : "Enregistrer"}
              </button>
            </div>
            {saveError && (
              <div className="mt-4 rounded-xl bg-primary/10 p-4">
                <div className="flex items-center gap-3">
                  <CloudOff size={16} className="shrink-0 text-primary-light" />
                  <span className="text-sm font-medium text-primary-light">{saveError}</span>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Action buttons */}
      {uiState === "idle" && (
        <div className="space-y-3 px-6 py-6">
          {/* Fix 1.6: Disable start button during tracking */}
          <button
            onClick={startTracking}
            disabled={uiState !== "idle"}
            className="flex w-full items-center justify-center gap-4 rounded-xl bg-primary py-6 shadow-[0px_20px_40px_rgba(0,0,0,0.4)] active:scale-95 disabled:opacity-50"
          >
            <Play size={28} className="text-bg" fill="currentColor" />
            <span className="text-xl font-black uppercase tracking-widest text-bg">Démarrer</span>
          </button>
          <button
            onClick={() => setUiState("manual")}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-surface-container py-4 active:scale-95"
          >
            <Keyboard size={18} className="text-text-muted" />
            <span className="text-sm font-bold text-text-muted">Saisie manuelle</span>
          </button>
        </div>
      )}

      {uiState === "tracking" && (
        <div className="px-6 py-6">
          <button
            onClick={stopTracking}
            className="flex w-full items-center justify-center gap-4 rounded-xl bg-danger py-6 shadow-[0px_20px_40px_rgba(0,0,0,0.4)] active:scale-95"
          >
            <Square size={28} className="text-text" fill="currentColor" />
            <span className="text-xl font-black uppercase tracking-widest text-text">Terminer</span>
          </button>
        </div>
      )}
    </div>
  );
}
