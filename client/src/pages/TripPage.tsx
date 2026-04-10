import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Play, Keyboard, AlertTriangle } from "lucide-react";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import type { MapRef, LayerProps } from "react-map-gl/maplibre";
// maplibre-gl.css imported in app.css to avoid orphan CSS chunks
import { useCreateTrip, useProfile, useTripPresets } from "@/hooks/queries";
import { CO2_KG_PER_LITER } from "@ecoride/shared/types";
import { useAppGpsTracking } from "@/hooks/useGpsTracking";
import type { TrackingSession } from "@/hooks/useGpsTracking";
import { queueTrip } from "@/lib/offline-queue";
import { clearStoppedSession, setStoppedSession } from "@/lib/stopped-session";
import { isWebGLSupported } from "@/lib/webgl";
import { MapNoWebGL } from "@/components/MapNoWebGL";
import { formatTime } from "@/lib/format-utils";
import { buildTraceGeoJSON, speedTraceLayer, solidTraceLayer } from "@/lib/speedGeoJSON";
import { GpsStatusBadge } from "@/components/trip/GpsStatusBadge";
import { TripRecoveryBanner } from "@/components/trip/TripRecoveryBanner";
import { TrackingDashboard } from "@/components/trip/TrackingDashboard";
import { StoppedSummary } from "@/components/trip/StoppedSummary";
import { ManualEntryForm } from "@/components/trip/ManualEntryForm";
import { InterruptMenu } from "@/components/trip/InterruptMenu";
import { TrackingControls } from "@/components/trip/TrackingControls";
import { useSessionRecovery } from "@/hooks/useSessionRecovery";
import { useManualTrip } from "@/hooks/useManualTrip";
import { useMapCamera } from "@/hooks/useMapCamera";
import { useMapOrientation } from "@/hooks/useMapOrientation";
import { MapOrientationButton } from "@/components/trip/MapOrientationButton";
import { PageHeader } from "@/components/layout/PageHeader";

type TripState = "idle" | "tracking" | "stopped" | "manual";

const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522]; // Paris
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const TRACKING_CAMERA_PADDING = { top: 200, bottom: 0, left: 0, right: 0 };

export function TripPage() {
  const [uiState, setUiState] = useState<TripState>("idle");
  const [saveError, setSaveError] = useState("");
  const [initialPos, setInitialPos] = useState<[number, number]>(DEFAULT_CENTER);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "active" | "denied" | "unavailable">(
    "waiting",
  );
  const [idleAccuracy, setIdleAccuracy] = useState<number | null>(null);
  const [interruptMenuOpen, setInterruptMenuOpen] = useState(false);
  const trackingMapRef = useRef<MapRef>(null);
  const idleMapRef = useRef<MapRef>(null);
  const createTrip = useCreateTrip();
  const { data: profileData } = useProfile();
  const { data: tripPresetsData } = useTripPresets();
  const gps = useAppGpsTracking();
  const { orientation, toggle: toggleOrientation } = useMapOrientation();
  const isPov = orientation === "pov";

  const tripPresets = tripPresetsData ?? [];

  // --- Custom hooks ---
  const recovery = useSessionRecovery({ gps });
  const manual = useManualTrip(tripPresets);

  // Apply initial UI state from session recovery (mount only)
  useEffect(() => {
    if (recovery.initialUiState) {
      setUiState(recovery.initialUiState);
    }
  }, [recovery.initialUiState]);

  // Fix 1.7: Navigation guard — beforeunload for browser close/refresh
  useEffect(() => {
    if (uiState !== "tracking" && uiState !== "stopped") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uiState]);

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

  // --- Performance: memoize derived data ---
  const positions = useMemo<[number, number][]>(
    () => gps.state.gpsPoints.map((p) => [p.lat, p.lng]),
    [gps.state.gpsPoints],
  );
  const lastPos = positions.length > 0 ? positions[positions.length - 1] : undefined;
  const currentPos = useMemo<[number, number]>(() => lastPos ?? initialPos, [lastPos, initialPos]);

  // --- Map cameras (extracted hook) ---
  const trackingCamera = useMapCamera(trackingMapRef, currentPos, {
    bearing: isPov ? gps.state.heading : 0,
    pitch: isPov ? 45 : 0,
    padding: TRACKING_CAMERA_PADDING,
    enabled: uiState === "tracking",
  });
  const idleCamera = useMapCamera(idleMapRef, currentPos, {
    enabled: uiState !== "tracking",
  });

  const traceGeoJSON = useMemo(() => buildTraceGeoJSON(gps.state.gpsPoints), [gps.state.gpsPoints]);
  const hasSpeedData = traceGeoJSON.type === "FeatureCollection";

  const webGLSupported = useMemo(() => isWebGLSupported(), []);
  const [webglLost, setWebglLost] = useState(false);
  const mapStyleReadyRef = useRef(false);
  const [mapLoadError, setMapLoadError] = useState(false);

  const distance =
    uiState === "stopped" && recovery.sessionRef.current
      ? recovery.sessionRef.current.distanceKm
      : gps.state.distanceKm;
  const elapsed =
    uiState === "stopped" && recovery.sessionRef.current
      ? recovery.sessionRef.current.durationSec
      : gps.state.durationSec;

  const consumptionL100 = profileData?.user?.consumptionL100 ?? 7;
  const co2Saved = distance * (consumptionL100 / 100) * CO2_KG_PER_LITER;

  // --- Helper to reset map-related state ---
  const resetMapState = useCallback(() => {
    mapStyleReadyRef.current = false;
    setWebglLost(false);
    setMapLoadError(false);
  }, []);

  // --- Performance: memoize key handlers ---
  const handleSaveTrip = useCallback(
    (km: number, durationSec: number, session?: TrackingSession | null) => {
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
          clearStoppedSession();
          recovery.setPendingBackup(null);
          setUiState("idle");
          manual.resetManualForm();
          recovery.sessionRef.current = null;
          gps.reset();
        },
        onError: () => {
          queueTrip(tripData);
          setSaveError("Trajet sauvegard\u00e9 hors-ligne. Il sera envoy\u00e9 automatiquement.");
          setTimeout(() => {
            recovery.setPendingBackup(null);
            setUiState("idle");
            clearStoppedSession();
            manual.resetManualForm();
            recovery.sessionRef.current = null;
            gps.reset();
            setSaveError("");
          }, 3000);
        },
      });
    },
    [createTrip, gps, recovery, manual],
  );

  const startTracking = useCallback(() => {
    resetMapState();
    recovery.setSessionPersistFailed(false);
    setInterruptMenuOpen(false);
    recovery.setPendingBackup(null);
    recovery.sessionRef.current = null;
    gps.start();
    setUiState("tracking");
  }, [gps, recovery, resetMapState]);

  const stopTracking = useCallback(
    (showStoppedPanel = true) => {
      const session = gps.stop();
      recovery.sessionRef.current = session;
      resetMapState();
      setInterruptMenuOpen(false);
      if (!setStoppedSession(session)) {
        recovery.setSessionPersistFailed(true);
      }
      if (showStoppedPanel) setUiState("stopped");
      return session;
    },
    [gps, recovery, resetMapState],
  );

  const handleInterrupt = useCallback(() => {
    if (!gps.state.isPaused) gps.pause();
    setInterruptMenuOpen(true);
  }, [gps]);

  const handleResumeFromInterrupt = useCallback(() => {
    gps.resume();
    setInterruptMenuOpen(false);
  }, [gps]);

  const handleStopFromInterrupt = useCallback(() => {
    const session = gps.stop();
    recovery.sessionRef.current = session;
    resetMapState();
    setInterruptMenuOpen(false);
    recovery.setPendingBackup(null);
    recovery.setSessionPersistFailed(false);
    clearStoppedSession();
    setUiState("idle");
    handleSaveTrip(session.distanceKm, session.durationSec, session);
  }, [gps, recovery, resetMapState, handleSaveTrip]);

  const handleAbandonFromInterrupt = useCallback(() => {
    if (window.confirm("Abandonner ce trajet ? Les donn\u00e9es seront perdues.")) {
      recovery.setPendingBackup(null);
      clearStoppedSession();
      setInterruptMenuOpen(false);
      setUiState("idle");
      recovery.sessionRef.current = null;
      gps.reset();
    }
  }, [gps, recovery]);

  const handleRestore = useCallback(() => {
    recovery.handleRestore(() => {
      resetMapState();
      setInterruptMenuOpen(false);
    });
    setUiState("tracking");
  }, [recovery, resetMapState]);

  return (
    <div
      className="relative flex h-[calc(100dvh_-_6rem)] flex-col overflow-hidden"
      data-testid="trip-page-root"
    >
      <PageHeader
        title="Trajet"
        titleHidden
        right={
          <GpsStatusBadge
            uiState={uiState}
            gpsAccuracy={gps.state.lastAccuracy}
            idleAccuracy={idleAccuracy}
            isTracking={gps.state.isTracking}
            gpsStatus={gpsStatus}
          />
        }
      />

      {/* Fix 1.3: Recovery banner for interrupted trip */}
      {recovery.pendingBackup && uiState === "idle" && (
        <TripRecoveryBanner
          backup={recovery.pendingBackup}
          formatTime={formatTime}
          onRestore={handleRestore}
          onDismiss={recovery.handleDismissBackup}
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
            data-map-orientation={orientation}
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
                    bearing: isPov ? (gps.state.heading ?? 0) : 0,
                    pitch: isPov && gps.state.heading != null ? 45 : 0,
                  }}
                  mapStyle={MAP_STYLE}
                  attributionControl={false}
                  fadeDuration={0}
                  style={{ width: "100%", height: "100%" }}
                  onLoad={(e) => {
                    mapStyleReadyRef.current = true;
                    setMapLoadError(false);
                    trackingCamera.setMapLoadSeq((s) => s + 1);
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
                          transform: isPov ? undefined : `rotate(${gps.state.heading}deg)`,
                          transition: "transform 300ms linear",
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
            <div className="pointer-events-none absolute right-3 top-3 z-10">
              <div className="pointer-events-auto">
                <MapOrientationButton orientation={orientation} onToggle={toggleOrientation} />
              </div>
            </div>
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
                  idleCamera.setMapLoadSeq((s) => s + 1);
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
            if (window.confirm("Abandonner ce trajet ? Les donn\u00e9es seront perdues.")) {
              recovery.setPendingBackup(null);
              clearStoppedSession();
              setUiState("idle");
              recovery.sessionRef.current = null;
              gps.reset();
            }
          }}
          onSave={() => {
            if (window.confirm("Enregistrer ce trajet ?")) {
              handleSaveTrip(distance, elapsed, recovery.sessionRef.current);
            }
          }}
          isSaving={createTrip.isPending}
          sessionPersistFailed={recovery.sessionPersistFailed}
          saveError={saveError}
        />
      )}

      {/* Manual entry */}
      {uiState === "manual" && (
        <ManualEntryForm
          manualKm={manual.manualKm}
          setManualKm={manual.setManualKm}
          manualMinutes={manual.manualMinutes}
          setManualMinutes={manual.setManualMinutes}
          manualPresetId={manual.manualPresetId}
          setManualPresetId={manual.setManualPresetId}
          onPresetChange={manual.handleManualPresetChange}
          tripPresets={tripPresets}
          onSubmit={(km, durationSec) => handleSaveTrip(km, durationSec)}
          onCancel={() => {
            manual.resetManualForm();
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
              {createTrip.isPending ? "Enregistrement..." : "D\u00e9marrer"}
            </span>
          </button>
          <button
            onClick={() => {
              manual.resetManualForm();
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
              canStop={distance >= 0.01}
            />
          )}
        </>
      )}
    </div>
  );
}
