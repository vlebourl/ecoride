import { useState, useEffect, useRef, useMemo } from "react";
import { Play, Square, Pause, Keyboard, AlertTriangle, CloudOff, RotateCcw, X } from "lucide-react";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCreateTrip, useProfile, useTripPresets } from "@/hooks/queries";
import { CO2_KG_PER_LITER } from "@ecoride/shared/types";
import {
  useAppGpsTracking,
  getTrackingBackup,
  clearTrackingBackup,
  getTrackingSession,
} from "@/hooks/useGpsTracking";
import type { TrackingSession, TrackingBackup } from "@/hooks/useGpsTracking";
import { queueTrip } from "@/lib/offline-queue";
import { isWebGLSupported } from "@/lib/webgl";
import { MapNoWebGL } from "@/components/MapNoWebGL";
import { Super73ModeButton } from "@/components/Super73ModeButton";
import { buildTraceGeoJSON, speedTraceLayer, solidTraceLayer } from "@/lib/speedGeoJSON";

type TripState = "idle" | "tracking" | "stopped" | "manual";

const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522]; // Paris
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const TRACKING_CAMERA_PADDING = { top: 200, bottom: 0, left: 0, right: 0 };

export function TripPage() {
  const [uiState, setUiState] = useState<TripState>("idle");
  const [manualKm, setManualKm] = useState("");
  const [saveError, setSaveError] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [manualPresetId, setManualPresetId] = useState<string>("custom");
  const [initialPos, setInitialPos] = useState<[number, number]>(DEFAULT_CENTER);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "active" | "denied" | "unavailable">(
    "waiting",
  );
  const [idleAccuracy, setIdleAccuracy] = useState<number | null>(null);
  const [pendingBackup, setPendingBackup] = useState<TrackingBackup | null>(null);
  const [interruptMenuOpen, setInterruptMenuOpen] = useState(false);
  // True when sessionStorage.setItem threw on stop — user must not close the tab.
  const [sessionPersistFailed, setSessionPersistFailed] = useState(false);
  const sessionRef = useRef<TrackingSession | null>(null);
  const trackingMapRef = useRef<MapRef>(null);
  const idleMapRef = useRef<MapRef>(null);
  const trackingFlyToRef = useRef(0);
  const idleFlyToRef = useRef(0);
  const createTrip = useCreateTrip();
  const { data: profileData } = useProfile();
  const { data: tripPresetsData } = useTripPresets();
  const gps = useAppGpsTracking();

  // On mount: check for an active trip backup.
  // If sessionStorage shows this tab had an active trip (user navigated away),
  // auto-restore without prompting so the trip continues seamlessly.
  // If there is no session key (app crash / tab close), show the recovery prompt.
  useEffect(() => {
    // Restore an unsaved trip that survived navigation (data-loss guard).
    const stoppedRaw = sessionStorage.getItem("ecoride-stopped-session");
    if (stoppedRaw) {
      try {
        const session = JSON.parse(stoppedRaw) as TrackingSession;
        sessionRef.current = session;
        setUiState("stopped");
      } catch {
        sessionStorage.removeItem("ecoride-stopped-session");
      }
      return;
    }
    if (gps.state.isTracking) {
      setUiState("tracking");
      return;
    }
    const backup = getTrackingBackup();
    if (!backup) return;
    const sessionStartedAt = getTrackingSession();
    if (sessionStartedAt && sessionStartedAt === backup.startedAt) {
      // User navigated away mid-trip — restore silently
      gps.restore(backup);
      setUiState("tracking");
    } else {
      // Crash recovery — ask the user whether to resume
      setPendingBackup(backup);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fix 1.7: Navigation guard — beforeunload for browser close/refresh
  useEffect(() => {
    if (uiState !== "tracking" && uiState !== "stopped") return;
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

  // Derive map data from GPS state (must be before flyTo effects so currentPos is defined)
  const positions: [number, number][] = gps.state.gpsPoints.map((p) => [p.lat, p.lng]);
  const lastPos = positions.length > 0 ? positions[positions.length - 1] : undefined;
  const currentPos: [number, number] = lastPos ?? initialPos;

  // Incremented by each map's onLoad so pending flyTo updates are replayed after map is ready.
  const [trackingMapLoadSeq, setTrackingMapLoadSeq] = useState(0);
  const [idleMapLoadSeq, setIdleMapLoadSeq] = useState(0);

  // Fly to current position on tracking map (throttled 500ms).
  // Throttle is only advanced after a confirmed flyTo — if the map is not yet
  // ready, we return without consuming the timestamp so the next GPS tick or
  // the onLoad replay can still execute the move.
  useEffect(() => {
    if (uiState !== "tracking") return;
    const now = Date.now();
    if (now - trackingFlyToRef.current < 500) return;
    const map = trackingMapRef.current;
    if (!map) return; // map not yet mounted; onLoad will replay via trackingMapLoadSeq
    trackingFlyToRef.current = now;
    map.flyTo({
      center: [currentPos[1], currentPos[0]],
      bearing: gps.state.heading ?? 0,
      pitch: gps.state.heading != null ? 45 : 0,
      zoom: 15,
      duration: 400,
      padding: TRACKING_CAMERA_PADDING,
    });
    // trackingFlyToRef is a ref (stable) — trackingMapLoadSeq is intentionally listed
    // so onLoad triggers a replay for GPS updates that arrived before the map was ready.
  }, [uiState, currentPos[0], currentPos[1], gps.state.heading, trackingMapLoadSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to current position on idle map (throttled 500ms).
  // Same load-race fix as the tracking effect: throttle is only advanced after
  // a confirmed flyTo so onLoad can replay any update that arrived before mount.
  useEffect(() => {
    if (uiState === "tracking") return;
    const now = Date.now();
    if (now - idleFlyToRef.current < 500) return;
    const map = idleMapRef.current;
    if (!map) return; // map not yet mounted; onLoad will replay via idleMapLoadSeq
    idleFlyToRef.current = now;
    map.flyTo({
      center: [currentPos[1], currentPos[0]],
      zoom: 15,
      duration: 400,
    });
    // idleFlyToRef is a ref (stable) — idleMapLoadSeq is intentionally listed.
  }, [uiState, currentPos[0], currentPos[1], idleMapLoadSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  const traceGeoJSON = useMemo(() => buildTraceGeoJSON(gps.state.gpsPoints), [gps.state.gpsPoints]);
  const hasSpeedData = traceGeoJSON.type === "FeatureCollection";

  const webGLSupported = useMemo(() => isWebGLSupported(), []);
  // Tracks runtime WebGL context loss after initial mount.
  // webGLSupported covers capability at mount; webglLost covers loss during the session.
  const [webglLost, setWebglLost] = useState(false);
  // Guards onError: only pre-load errors indicate a non-functional map.
  // Post-load errors are transient tile failures — MapLibre retries them automatically.
  const mapStyleReadyRef = useRef(false);
  const [mapLoadError, setMapLoadError] = useState(false);

  const distance =
    uiState === "stopped" && sessionRef.current
      ? sessionRef.current.distanceKm
      : gps.state.distanceKm;
  const elapsed =
    uiState === "stopped" && sessionRef.current
      ? sessionRef.current.durationSec
      : gps.state.durationSec;

  const startTracking = () => {
    trackingFlyToRef.current = 0;
    idleFlyToRef.current = 0;
    mapStyleReadyRef.current = false;
    setWebglLost(false);
    setMapLoadError(false);
    setSessionPersistFailed(false);
    setInterruptMenuOpen(false);
    // Dismiss any stale crash-recovery banner — the user is starting a new trip.
    setPendingBackup(null);
    sessionRef.current = null;
    gps.start();
    setUiState("tracking");
  };

  const stopTracking = (showStoppedPanel = true) => {
    const session = gps.stop();
    sessionRef.current = session;
    trackingFlyToRef.current = 0;
    idleFlyToRef.current = 0;
    mapStyleReadyRef.current = false;
    setWebglLost(false);
    setMapLoadError(false);
    setInterruptMenuOpen(false);
    // Persist session so accidental navigation cannot destroy unsaved trip data.
    // QuotaExceededError is caught — setUiState("stopped") always runs even if
    // the write fails; sessionRef.current remains the authoritative in-memory copy.
    try {
      sessionStorage.setItem("ecoride-stopped-session", JSON.stringify(session));
    } catch {
      // Storage quota exceeded — flag so the stopped panel can warn the user not
      // to close the tab before saving. sessionRef.current is still valid.
      setSessionPersistFailed(true);
    }
    if (showStoppedPanel) setUiState("stopped");
    return session;
  };

  // Fix 1.3: Restore tracking from backup
  const handleRestore = () => {
    if (!pendingBackup) return;
    trackingFlyToRef.current = 0;
    mapStyleReadyRef.current = false;
    setWebglLost(false);
    setMapLoadError(false);
    setInterruptMenuOpen(false);
    gps.restore(pendingBackup);
    setUiState("tracking");
    setPendingBackup(null);
  };

  const handleDismissBackup = () => {
    clearTrackingBackup();
    setPendingBackup(null);
  };

  const handleInterrupt = () => {
    if (!gps.state.isPaused) gps.pause();
    setInterruptMenuOpen(true);
  };

  const handleResumeFromInterrupt = () => {
    gps.resume();
    setInterruptMenuOpen(false);
  };

  const handleStopFromInterrupt = () => {
    const session = gps.stop();
    sessionRef.current = session;
    trackingFlyToRef.current = 0;
    idleFlyToRef.current = 0;
    mapStyleReadyRef.current = false;
    setWebglLost(false);
    setMapLoadError(false);
    setInterruptMenuOpen(false);
    setPendingBackup(null);
    setSessionPersistFailed(false);
    sessionStorage.removeItem("ecoride-stopped-session");
    setUiState("idle");
    handleSaveTrip(session.distanceKm, session.durationSec, session);
  };

  const handleAbandonFromInterrupt = () => {
    if (window.confirm("Abandonner ce trajet ? Les données seront perdues.")) {
      setPendingBackup(null);
      sessionStorage.removeItem("ecoride-stopped-session");
      setInterruptMenuOpen(false);
      setUiState("idle");
      sessionRef.current = null;
      gps.reset();
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const consumptionL100 = profileData?.user?.consumptionL100 ?? 7; // Default 7 L/100km (matches server)
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
        sessionStorage.removeItem("ecoride-stopped-session");
        setPendingBackup(null);
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
          setPendingBackup(null);
          setUiState("idle");
          sessionStorage.removeItem("ecoride-stopped-session");
          setManualKm("");
          setManualMinutes("");
          sessionRef.current = null;
          gps.reset();
          setSaveError("");
        }, 3000);
      },
    });
  };

  const tripPresets = tripPresetsData ?? [];

  const applyManualPreset = (tripPreset: {
    id: string;
    distanceKm: number;
    durationSec: number | null;
  }) => {
    setManualPresetId(tripPreset.id);
    setManualKm(String(tripPreset.distanceKm));
    setManualMinutes(
      tripPreset.durationSec == null
        ? ""
        : String(Math.max(1, Math.round(tripPreset.durationSec / 60))),
    );
  };

  const handleManualPresetChange = (value: string) => {
    if (value === "custom") {
      setManualPresetId("custom");
      setManualKm("");
      setManualMinutes("");
      return;
    }

    const tripPreset = tripPresets.find((preset) => preset.id === value);
    if (!tripPreset) return;
    applyManualPreset(tripPreset);
  };

  return (
    <div
      className="relative flex h-[calc(100dvh_-_6rem)] flex-col overflow-hidden"
      data-testid="trip-page-root"
    >
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
            {gps.state.isPaused ? (
              <span
                className="text-5xl font-black tracking-tighter text-warning"
                aria-label="Trajet en pause"
              >
                PAUSÉ
              </span>
            ) : (
              <span className="text-7xl font-black tracking-tighter text-text">
                {gps.state.speedKmh != null ? gps.state.speedKmh.toFixed(0) : "—"}
              </span>
            )}
            <span className="text-sm font-bold uppercase tracking-widest text-text-dim">
              {gps.state.isPaused ? "en pause" : "km/h"}
            </span>
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
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            data-testid="tracking-map"
            data-heading={gps.state.heading ?? 0}
            data-camera-padding-top={TRACKING_CAMERA_PADDING.top}
            data-camera-padding-bottom={TRACKING_CAMERA_PADDING.bottom}
          >
            {webGLSupported ? (
              <>
                <Map
                  ref={trackingMapRef}
                  initialViewState={{
                    longitude: currentPos[1],
                    latitude: currentPos[0],
                    zoom: 15,
                    bearing: gps.state.heading ?? 0,
                    pitch: gps.state.heading != null ? 45 : 0,
                  }}
                  mapStyle={MAP_STYLE}
                  attributionControl={false}
                  fadeDuration={0}
                  style={{ width: "100%", height: "100%" }}
                  onLoad={(e) => {
                    mapStyleReadyRef.current = true;
                    setMapLoadError(false);
                    // Bump load sequence to replay any GPS update that arrived before
                    // the map was ready. Also resets stale WebGL-loss state.
                    setTrackingMapLoadSeq((s) => s + 1);
                    setWebglLost(false);
                    const m = e.target;
                    m.on("webglcontextlost", () => setWebglLost(true));
                    m.on("webglcontextrestored", () => setWebglLost(false));
                  }}
                  onError={() => {
                    // Only show fallback for pre-load failures (style/sprites/glyphs).
                    // Post-load tile errors are transient — MapLibre retries them.
                    if (!mapStyleReadyRef.current) setMapLoadError(true);
                  }}
                >
                  {positions.length > 1 && (
                    <Source id="trace-tracking" type="geojson" data={traceGeoJSON}>
                      <Layer {...(hasSpeedData ? speedTraceLayer : solidTraceLayer)} />
                    </Source>
                  )}
                  <Marker longitude={currentPos[1]} latitude={currentPos[0]}>
                    {gps.state.heading != null ? (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24">
                          <path
                            d="M12 2 L18 20 L12 16 L6 20 Z"
                            fill="#2ecc71"
                            stroke="#fff"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "#2ecc71",
                          border: "2px solid #ffffff",
                        }}
                      />
                    )}
                  </Marker>
                </Map>
                {(webglLost || mapLoadError) && (
                  <div className="absolute inset-0">
                    <MapNoWebGL />
                  </div>
                )}
              </>
            ) : (
              <MapNoWebGL />
            )}
          </div>
        </>
      )}

      {/* === IDLE / STOPPED / MANUAL: full map === */}
      {uiState !== "tracking" && (
        <div className="relative min-h-0 flex-1" data-testid="idle-map">
          {webGLSupported ? (
            <>
              <Map
                ref={idleMapRef}
                initialViewState={{
                  longitude: currentPos[1],
                  latitude: currentPos[0],
                  zoom: 15,
                  bearing: 0,
                  pitch: 0,
                }}
                mapStyle={MAP_STYLE}
                attributionControl={false}
                style={{ width: "100%", height: "100%" }}
                onLoad={(e) => {
                  mapStyleReadyRef.current = true;
                  setMapLoadError(false);
                  setIdleMapLoadSeq((s) => s + 1);
                  setWebglLost(false);
                  const m = e.target;
                  m.on("webglcontextlost", () => setWebglLost(true));
                  m.on("webglcontextrestored", () => setWebglLost(false));
                }}
                onError={() => {
                  if (!mapStyleReadyRef.current) setMapLoadError(true);
                }}
              >
                {positions.length > 1 && (
                  <Source id="trace-idle" type="geojson" data={traceGeoJSON}>
                    <Layer
                      {...(hasSpeedData ? speedTraceLayer : solidTraceLayer)}
                      id="trace-idle"
                    />
                  </Source>
                )}
                <Marker longitude={currentPos[1]} latitude={currentPos[0]}>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "#2ecc71",
                      border: "2px solid #ffffff",
                    }}
                  />
                </Marker>
              </Map>
              {(webglLost || mapLoadError) && (
                <div className="absolute inset-0">
                  <MapNoWebGL />
                </div>
              )}
            </>
          ) : (
            <MapNoWebGL />
          )}
        </div>
      )}

      {/* Stopped summary */}
      {uiState === "stopped" && (
        <div className="space-y-4 px-6 pb-4" data-no-swipe>
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
                    setPendingBackup(null);
                    sessionStorage.removeItem("ecoride-stopped-session");
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
            {sessionPersistFailed && (
              <div className="mt-4 rounded-xl bg-danger/10 p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={16} className="shrink-0 text-danger" />
                  <span className="text-sm font-medium text-danger">
                    Session non sauvegardée localement (stockage insuffisant). Enregistrez le trajet
                    avant de fermer cet onglet.
                  </span>
                </div>
              </div>
            )}
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
        <div className="min-h-0 overflow-y-auto px-6 pb-4">
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
            <p className="mb-4 text-sm text-text-muted">
              Choisissez un trajet pré-enregistré ou l'option personnalisée, puis ajustez les champs
              si besoin avant d'enregistrer.
            </p>
            <label
              htmlFor="manual-preset-select"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted"
            >
              Trajet pré-enregistré
            </label>
            <select
              id="manual-preset-select"
              value={manualPresetId}
              onChange={(e) => handleManualPresetChange(e.target.value)}
              className="mb-4 w-full rounded-lg bg-surface-high p-4 text-base font-bold text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="custom">Personnalisé</option>
              {tripPresets.map((tripPreset) => (
                <option key={tripPreset.id} value={tripPreset.id}>
                  {tripPreset.label}
                </option>
              ))}
            </select>
            <label
              htmlFor="manual-distance-input"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted"
            >
              Distance (km)
            </label>
            <input
              id="manual-distance-input"
              type="number"
              value={manualKm}
              onChange={(e) => {
                setManualPresetId("custom");
                setManualKm(e.target.value);
              }}
              placeholder="0.0"
              className="mb-4 w-full rounded-lg bg-surface-high p-4 text-2xl font-bold text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <label
              htmlFor="manual-duration-input"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-muted"
            >
              Durée (minutes)
            </label>
            <input
              id="manual-duration-input"
              type="number"
              value={manualMinutes}
              onChange={(e) => {
                setManualPresetId("custom");
                setManualMinutes(e.target.value);
              }}
              placeholder="Optionnel"
              className="mb-4 w-full rounded-lg bg-surface-high p-4 text-2xl font-bold text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setManualPresetId("custom");
                  setUiState("idle");
                }}
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
            disabled={uiState !== "idle" || createTrip.isPending}
            className="flex w-full items-center justify-center gap-4 rounded-xl bg-primary py-6 shadow-[0px_20px_40px_rgba(0,0,0,0.4)] active:scale-95 disabled:opacity-50"
          >
            <Play size={28} className="text-bg" fill="currentColor" />
            <span className="text-xl font-black uppercase tracking-widest text-bg">
              {createTrip.isPending ? "Enregistrement..." : "Démarrer"}
            </span>
          </button>
          <button
            onClick={() => {
              setManualPresetId("custom");
              setManualKm("");
              setManualMinutes("");
              setUiState("manual");
            }}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-surface-container py-4 active:scale-95"
          >
            <Keyboard size={18} className="text-text-muted" />
            <span className="text-sm font-bold text-text-muted">Saisie manuelle</span>
          </button>
        </div>
      )}

      {uiState === "tracking" && (
        <>
          <div className="flex gap-3 px-6 py-6">
            {profileData?.user?.super73Enabled && <Super73ModeButton enabled compact />}
            <button
              onClick={handleInterrupt}
              className={`flex flex-1 items-center justify-center gap-4 rounded-xl py-6 shadow-[0px_20px_40px_rgba(0,0,0,0.4)] active:scale-95 ${
                gps.state.isPaused ? "bg-warning/20" : "bg-danger"
              }`}
              aria-label={
                gps.state.isPaused ? "Ouvrir le menu d'interruption" : "Interrompre le trajet"
              }
            >
              <Pause
                size={28}
                className={gps.state.isPaused ? "text-warning" : "text-text"}
                fill="currentColor"
              />
              <span
                className={`text-xl font-black uppercase tracking-widest ${
                  gps.state.isPaused ? "text-warning" : "text-text"
                }`}
              >
                {gps.state.isPaused ? "Interrompu" : "Interrompre"}
              </span>
            </button>
          </div>

          {interruptMenuOpen && (
            <div className="fixed inset-0 z-50 flex items-end bg-black/50 px-6 pb-6" data-no-swipe>
              <div
                className="w-full rounded-3xl border border-surface-highest bg-surface p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
                role="dialog"
                aria-label="Menu d'interruption du trajet"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-widest text-text-dim">
                      Trajet interrompu
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      Reprendre, terminer ou abandonner ce trajet.
                    </p>
                  </div>
                  <button
                    onClick={() => setInterruptMenuOpen(false)}
                    className="rounded-xl p-2 text-text-muted active:scale-95"
                    aria-label="Fermer le menu d'interruption"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleResumeFromInterrupt}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 text-base font-black uppercase tracking-widest text-bg active:scale-95"
                  >
                    <Play size={20} fill="currentColor" />
                    Reprendre
                  </button>
                  <button
                    onClick={handleStopFromInterrupt}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-surface-high py-4 text-base font-bold text-text active:scale-95"
                  >
                    <Square size={18} fill="currentColor" />
                    Terminer
                  </button>
                  <button
                    onClick={handleAbandonFromInterrupt}
                    className="flex w-full items-center justify-center rounded-2xl bg-danger/10 py-4 text-base font-bold text-danger active:scale-95"
                  >
                    Abandonner
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
