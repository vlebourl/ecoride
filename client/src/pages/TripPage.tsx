import { useState, useEffect, useRef, useMemo } from "react";
import { Play, Keyboard, AlertTriangle } from "lucide-react";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import type { MapRef, LayerProps } from "react-map-gl/maplibre";
// maplibre-gl.css imported in app.css to avoid orphan CSS chunks
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
import { buildTraceGeoJSON, speedTraceLayer, solidTraceLayer } from "@/lib/speedGeoJSON";
import { GpsStatusBadge } from "@/components/trip/GpsStatusBadge";
import { TripRecoveryBanner } from "@/components/trip/TripRecoveryBanner";
import { TrackingDashboard } from "@/components/trip/TrackingDashboard";
import { StoppedSummary } from "@/components/trip/StoppedSummary";
import { ManualEntryForm } from "@/components/trip/ManualEntryForm";
import { InterruptMenu } from "@/components/trip/InterruptMenu";
import { TrackingControls } from "@/components/trip/TrackingControls";

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
    if (!map || !map.isStyleLoaded()) return; // map or style not ready; onLoad will replay
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
    if (!map || !map.isStyleLoaded()) return; // map or style not ready; onLoad will replay
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
        <GpsStatusBadge
          uiState={uiState}
          gpsAccuracy={gps.state.lastAccuracy}
          idleAccuracy={idleAccuracy}
          isTracking={gps.state.isTracking}
          gpsStatus={gpsStatus}
        />
      </header>

      {/* Fix 1.3: Recovery banner for interrupted trip */}
      {pendingBackup && uiState === "idle" && (
        <TripRecoveryBanner
          backup={pendingBackup}
          formatTime={formatTime}
          onRestore={handleRestore}
          onDismiss={handleDismissBackup}
        />
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
          <TrackingDashboard
            isPaused={gps.state.isPaused}
            speedKmh={gps.state.speedKmh}
            distance={distance}
            co2Saved={co2Saved}
            elapsed={elapsed}
            formatTime={formatTime}
          />

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
                      <Layer
                        {...((hasSpeedData ? speedTraceLayer : solidTraceLayer) as LayerProps)}
                      />
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
                      {...((hasSpeedData ? speedTraceLayer : solidTraceLayer) as LayerProps)}
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
        <StoppedSummary
          distance={distance}
          co2Saved={co2Saved}
          elapsed={elapsed}
          formatTime={formatTime}
          onAbandon={() => {
            if (window.confirm("Abandonner ce trajet ? Les données seront perdues.")) {
              setPendingBackup(null);
              sessionStorage.removeItem("ecoride-stopped-session");
              setUiState("idle");
              sessionRef.current = null;
              gps.reset();
            }
          }}
          onSave={() => {
            if (window.confirm("Enregistrer ce trajet ?")) {
              handleSaveTrip(distance, elapsed, sessionRef.current);
            }
          }}
          isSaving={createTrip.isPending}
          sessionPersistFailed={sessionPersistFailed}
          saveError={saveError}
        />
      )}

      {/* Manual entry */}
      {uiState === "manual" && (
        <ManualEntryForm
          manualKm={manualKm}
          setManualKm={setManualKm}
          manualMinutes={manualMinutes}
          setManualMinutes={setManualMinutes}
          manualPresetId={manualPresetId}
          setManualPresetId={setManualPresetId}
          onPresetChange={handleManualPresetChange}
          tripPresets={tripPresets}
          onSubmit={(km, durationSec) => handleSaveTrip(km, durationSec)}
          onCancel={() => {
            setManualPresetId("custom");
            setUiState("idle");
          }}
          isSaving={createTrip.isPending}
          saveError={saveError}
        />
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
          <TrackingControls
            isPaused={gps.state.isPaused}
            onInterrupt={handleInterrupt}
            super73Enabled={profileData?.user?.super73Enabled}
          />

          {interruptMenuOpen && (
            <InterruptMenu
              onResume={handleResumeFromInterrupt}
              onStop={handleStopFromInterrupt}
              onAbandon={handleAbandonFromInterrupt}
              onClose={() => setInterruptMenuOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
