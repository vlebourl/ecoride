import { useState, useCallback, useRef, useEffect } from "react";
import { Play, Square, Keyboard } from "lucide-react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { useCreateTrip } from "@/hooks/queries";

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
  const [state, setState] = useState<TripState>("idle");
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [manualKm, setManualKm] = useState("");
  const [positions, setPositions] = useState<[number, number][]>([]);
  const [currentPos, setCurrentPos] = useState<[number, number]>(DEFAULT_CENTER);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const startTimeRef = useRef<Date>(new Date());
  const createTrip = useCreateTrip();

  const startTracking = useCallback(() => {
    setState("tracking");
    setDistance(0);
    setElapsed(0);
    setPositions([DEFAULT_CENTER]);
    setCurrentPos(DEFAULT_CENTER);
    startTimeRef.current = new Date();

    timerRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
      setDistance((d) => d + 0.003 + Math.random() * 0.005);
      setCurrentPos((prev) => {
        const next: [number, number] = [
          prev[0] + (Math.random() - 0.3) * 0.0003,
          prev[1] + (Math.random() - 0.3) * 0.0004,
        ];
        setPositions((pts) => [...pts, next]);
        return next;
      });
    }, 1000);
  }, []);

  const stopTracking = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState("stopped");
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const co2Saved = distance * 0.065 * 2.31;

  const handleSaveTrip = (km: number, durationSec: number) => {
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - durationSec * 1000);
    createTrip.mutate(
      {
        distanceKm: Math.round(km * 100) / 100,
        durationSec,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      },
      {
        onSuccess: () => {
          setState("idle");
          setDistance(0);
          setElapsed(0);
          setManualKm("");
          setPositions([]);
        },
      },
    );
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl">
        <span className="text-lg font-bold tracking-tight">
          <span className="text-text">eco</span><span className="text-primary-light">Ride</span>
        </span>
      </header>

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
        {state === "tracking" && (
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
      {state === "tracking" && (
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
      {state === "stopped" && (
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
              onClick={() => handleSaveTrip(distance, elapsed)}
              disabled={createTrip.isPending}
              className="mt-6 w-full rounded-xl bg-primary py-4 text-sm font-black uppercase tracking-widest text-bg active:scale-95 disabled:opacity-50"
            >
              {createTrip.isPending ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* Manual entry */}
      {state === "manual" && (
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
            <div className="flex gap-3">
              <button
                onClick={() => setState("idle")}
                className="flex-1 rounded-xl bg-surface-high py-4 text-sm font-bold text-text-muted active:scale-95"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  const km = parseFloat(manualKm);
                  if (km > 0) {
                    // Estimate ~15 km/h average cycling speed
                    const estimatedDuration = Math.round((km / 15) * 3600);
                    handleSaveTrip(km, estimatedDuration);
                  }
                }}
                disabled={createTrip.isPending || !manualKm || parseFloat(manualKm) <= 0}
                className="flex-1 rounded-xl bg-primary py-4 text-sm font-black uppercase tracking-widest text-bg active:scale-95 disabled:opacity-50"
              >
                {createTrip.isPending ? "..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {state === "idle" && (
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
            onClick={() => setState("manual")}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-surface-container py-4 active:scale-95"
          >
            <Keyboard size={18} className="text-text-muted" />
            <span className="text-sm font-bold text-text-muted">
              Saisie manuelle
            </span>
          </button>
        </div>
      )}

      {state === "tracking" && (
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
