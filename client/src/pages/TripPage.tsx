import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AlertTriangle, LocateFixed } from "lucide-react";
import type { MapRef } from "react-map-gl/maplibre";
import { useCreateTrip, useProfile, useTripPresets } from "@/hooks/queries";
import { CO2_KG_PER_LITER } from "@ecoride/shared/types";
import { useAppGpsTracking } from "@/hooks/useGpsTracking";
import type { TrackingSession } from "@/hooks/useGpsTracking";
import { queueTrip } from "@/lib/offline-queue";
import { ApiError } from "@/lib/api";
import { clearStoppedSession } from "@/lib/stopped-session";
import { isWebGLSupported } from "@/lib/webgl";
import { formatTime } from "@/lib/format-utils";
import { buildTraceGeoJSON } from "@/lib/speedGeoJSON";
import { GpsStatusBadge } from "@/components/trip/GpsStatusBadge";
import { TripRecoveryBanner } from "@/components/trip/TripRecoveryBanner";
import { TrackingDashboard } from "@/components/trip/TrackingDashboard";
import { StoppedSummary } from "@/components/trip/StoppedSummary";
import { ManualEntryForm } from "@/components/trip/ManualEntryForm";
import { InterruptMenu } from "@/components/trip/InterruptMenu";
import { TrackingControls } from "@/components/trip/TrackingControls";
import { TripIdleActions } from "@/components/trip/TripIdleActions";
import { TripMapCanvas } from "@/components/trip/TripMapCanvas";
import { useSessionRecovery } from "@/hooks/useSessionRecovery";
import { useManualTrip } from "@/hooks/useManualTrip";
import { useMapCamera } from "@/hooks/useMapCamera";
import { useMapOrientation } from "@/hooks/useMapOrientation";
import { MapOrientationButton } from "@/components/trip/MapOrientationButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { useT } from "@/i18n/provider";
import { useNavigation } from "@/hooks/useNavigation";
import { DestinationSearch } from "@/components/trip/DestinationSearch";
import { NavigationBanner } from "@/components/trip/NavigationBanner";
import { useSuper73 } from "@/hooks/useSuper73";
import { modeIndex } from "@/lib/super73-ble";
import { BatteryIndicator } from "@/components/trip/BatteryIndicator";
import { HeadlightIndicator } from "@/components/trip/HeadlightIndicator";

type TripState = "idle" | "tracking" | "stopped" | "manual";

const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522]; // Paris
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const TRACKING_CAMERA_PADDING = { top: 200, bottom: 0, left: 0, right: 0 };

function extractApiErrorMessage(error: ApiError): string | null {
  const body = error.body.trim();
  if (!body) return null;

  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const message = parsed.error?.message ?? parsed.message;
    return typeof message === "string" && message.trim() ? message : null;
  } catch {
    return body.startsWith("{") ? null : body;
  }
}

export function TripPage() {
  const t = useT();
  const [saveError, setSaveError] = useState("");
  const [initialPos, setInitialPos] = useState<[number, number]>(DEFAULT_CENTER);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "active" | "denied" | "unavailable">(() =>
    typeof navigator === "undefined" || !navigator.geolocation ? "unavailable" : "waiting",
  );
  const [idleAccuracy, setIdleAccuracy] = useState<number | null>(null);
  const [interruptMenuOpen, setInterruptMenuOpen] = useState(false);
  const trackingMapRef = useRef<MapRef>(null);
  const idleMapRef = useRef<MapRef>(null);
  const createTrip = useCreateTrip();
  const { data: profileData } = useProfile();
  const { data: tripPresetsData } = useTripPresets();
  const gps = useAppGpsTracking();
  const ble = useSuper73();
  const currentGpsPoint = gps.state.gpsPoints.at(-1) ?? null;
  const navigation = useNavigation({
    currentPoint: currentGpsPoint,
    lastAccuracy: gps.state.lastAccuracy,
  });
  const [showDestinationSearch, setShowDestinationSearch] = useState(false);
  const [isTrackingMapFollowing, setIsTrackingMapFollowing] = useState(true);
  const { orientation, toggle: toggleOrientation } = useMapOrientation();
  const isPov = orientation === "pov";

  const tripPresets = tripPresetsData ?? [];
  const effectiveSpeedKmh = ble.bikeSpeedKmh ?? gps.state.speedKmh;
  const s73Connected = ble.status === "connected";
  const assistLevel = s73Connected ? (ble.bikeState?.assist ?? null) : null;
  const classeLevel = s73Connected && ble.bikeState ? modeIndex(ble.bikeState.mode) + 1 : null;

  // --- Custom hooks ---
  const recovery = useSessionRecovery({ gps });
  const [uiState, setUiState] = useState<TripState>(() => recovery.initialUiState ?? "idle");
  const manual = useManualTrip(tripPresets);

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
    if (!navigator.geolocation) return;

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
    enabled: uiState === "tracking" && isTrackingMapFollowing,
  });
  const idleCamera = useMapCamera(idleMapRef, currentPos, {
    enabled: uiState !== "tracking",
  });

  const traceGeoJSON = useMemo(() => buildTraceGeoJSON(gps.state.gpsPoints), [gps.state.gpsPoints]);

  // Full route for idle map (user hasn't started yet)
  const fullRouteGeoJSON = useMemo(() => {
    if (!navigation.route) return null;
    return {
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: navigation.route.coordinates },
      properties: {},
    };
  }, [navigation.route]);

  // Remaining route for tracking map (shrinks as steps advance)
  const remainingRouteGeoJSON = useMemo(() => {
    if (navigation.remainingCoordinates.length < 2) return null;
    return {
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: navigation.remainingCoordinates },
      properties: {},
    };
  }, [navigation.remainingCoordinates]);
  const hasSpeedData = traceGeoJSON.type === "FeatureCollection";

  const webGLSupported = useMemo(() => isWebGLSupported(), []);
  const [webglLost, setWebglLost] = useState(false);
  const mapStyleReadyRef = useRef(false);
  const [mapLoadError, setMapLoadError] = useState(false);

  const stoppedSession = recovery.sessionRef.current;
  const distance =
    uiState === "stopped" && stoppedSession ? stoppedSession.distanceKm : gps.state.distanceKm;
  const elapsed =
    uiState === "stopped" && stoppedSession ? stoppedSession.durationSec : gps.state.durationSec;

  const consumptionL100 = profileData?.user?.consumptionL100 ?? 7;
  const co2Saved = distance * (consumptionL100 / 100) * CO2_KG_PER_LITER;

  // --- Helper to reset map-related state ---
  const resetMapState = useCallback(() => {
    mapStyleReadyRef.current = false;
    setWebglLost(false);
    setMapLoadError(false);
  }, []);

  const handleTrackingMapLoad = useCallback(
    (event: { target: { on: (name: string, listener: () => void) => void } }) => {
      mapStyleReadyRef.current = true;
      setMapLoadError(false);
      trackingCamera.setMapLoadSeq((seq) => seq + 1);
      setWebglLost(false);
      const map = event.target;
      map.on("webglcontextlost", () => setWebglLost(true));
      map.on("webglcontextrestored", () => setWebglLost(false));
    },
    [trackingCamera],
  );

  const handleIdleMapLoad = useCallback(
    (event: { target: { on: (name: string, listener: () => void) => void } }) => {
      mapStyleReadyRef.current = true;
      setMapLoadError(false);
      idleCamera.setMapLoadSeq((seq) => seq + 1);
      setWebglLost(false);
      const map = event.target;
      map.on("webglcontextlost", () => setWebglLost(true));
      map.on("webglcontextrestored", () => setWebglLost(false));
    },
    [idleCamera],
  );

  const handleMapLoadError = useCallback(() => {
    if (!mapStyleReadyRef.current) setMapLoadError(true);
  }, []);

  // --- Performance: memoize key handlers ---
  const handleSaveTrip = useCallback(
    (
      km: number,
      durationSec: number,
      session?: TrackingSession | null,
      manualStartedAtIso?: string | null,
    ) => {
      setSaveError("");
      let startedAt: string;
      let endedAt: string;
      if (session) {
        endedAt = session.endedAt;
        startedAt = session.startedAt;
      } else if (manualStartedAtIso) {
        startedAt = manualStartedAtIso;
        endedAt = new Date(new Date(startedAt).getTime() + durationSec * 1000).toISOString();
      } else {
        endedAt = new Date().toISOString();
        startedAt = new Date(new Date(endedAt).getTime() - durationSec * 1000).toISOString();
      }
      const tripData = {
        distanceKm: Math.round(km * 100) / 100,
        durationSec,
        startedAt,
        endedAt,
        gpsPoints: session?.gpsPoints?.length ? session.gpsPoints : null,
        idempotencyKey: crypto.randomUUID(),
      };
      createTrip.mutate(tripData, {
        onSuccess: () => {
          setSaveError("");
          clearStoppedSession();
          recovery.setPendingBackup(null);
          setUiState("idle");
          manual.resetManualForm();
          recovery.clearSession();
          gps.reset();
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            setSaveError(extractApiErrorMessage(error) ?? t("trip.errors.saveRejected"));
            return;
          }

          queueTrip(tripData);
          setSaveError(t("trip.offline.savedLocally"));
          setTimeout(() => {
            recovery.setPendingBackup(null);
            setUiState("idle");
            clearStoppedSession();
            manual.resetManualForm();
            recovery.clearSession();
            gps.reset();
            setSaveError("");
          }, 3000);
        },
      });
    },
    [createTrip, gps, recovery, manual, t],
  );

  const startTracking = useCallback(() => {
    resetMapState();
    setIsTrackingMapFollowing(true);
    recovery.setSessionPersistFailed(false);
    setInterruptMenuOpen(false);
    recovery.setPendingBackup(null);
    recovery.clearSession();
    gps.start();
    setUiState("tracking");
  }, [gps, recovery, resetMapState]);

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
    recovery.setSession(session);
    resetMapState();
    setIsTrackingMapFollowing(true);
    setInterruptMenuOpen(false);
    recovery.setPendingBackup(null);
    recovery.setSessionPersistFailed(false);
    clearStoppedSession();
    setUiState("idle");
    navigation.clearRoute();
    handleSaveTrip(session.distanceKm, session.durationSec, session);
  }, [gps, recovery, resetMapState, handleSaveTrip, navigation]);

  const handleAbandonFromInterrupt = useCallback(() => {
    if (window.confirm("Abandonner ce trajet ? Les donn\u00e9es seront perdues.")) {
      recovery.setPendingBackup(null);
      clearStoppedSession();
      setInterruptMenuOpen(false);
      setIsTrackingMapFollowing(true);
      setUiState("idle");
      recovery.clearSession();
      gps.reset();
      navigation.clearRoute();
    }
  }, [gps, recovery, navigation]);

  const handleRestore = useCallback(() => {
    recovery.handleRestore(() => {
      resetMapState();
      setIsTrackingMapFollowing(true);
      setInterruptMenuOpen(false);
    });
    setUiState("tracking");
  }, [recovery, resetMapState]);

  const handleTrackingMapInteraction = useCallback(
    (evt?: { originalEvent?: unknown }) => {
      if (uiState !== "tracking") return;
      if (!evt?.originalEvent) return;
      setIsTrackingMapFollowing(false);
    },
    [uiState],
  );

  const handleTrackingMapRecenter = useCallback(() => {
    setIsTrackingMapFollowing(true);
  }, []);

  return (
    <div
      className="relative flex h-[calc(100dvh_-_6rem)] flex-col overflow-hidden"
      data-testid="trip-page-root"
    >
      <PageHeader
        title={t("trip.header.title")}
        titleHidden
        center={
          s73Connected ? (
            <div className="flex items-center gap-2">
              <BatteryIndicator percent={ble.batteryPercent} rangeKm={ble.rangeKm} />
              <HeadlightIndicator />
            </div>
          ) : undefined
        }
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
            speedKmh={effectiveSpeedKmh}
            distance={distance}
            co2Saved={co2Saved}
            elapsed={elapsed}
            formatTime={formatTime}
            assistLevel={assistLevel}
            classeLevel={classeLevel}
          />

          {navigation.destination && (
            <NavigationBanner
              nextInstruction={navigation.nextInstruction}
              distanceToNextStep={navigation.distanceToNextStep}
              isRecalculating={navigation.isLoading}
              isArrived={navigation.isArrived}
              maneuverType={navigation.currentStepType}
            />
          )}

          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            data-testid="tracking-map"
            data-heading={gps.state.heading ?? 0}
            data-map-orientation={orientation}
            data-camera-padding-top={TRACKING_CAMERA_PADDING.top}
            data-camera-padding-bottom={TRACKING_CAMERA_PADDING.bottom}
          >
            <TripMapCanvas
              mapRef={trackingMapRef}
              initialViewState={{
                longitude: currentPos[1],
                latitude: currentPos[0],
                zoom: 15,
                bearing: isPov ? (gps.state.heading ?? 0) : 0,
                pitch: isPov && gps.state.heading != null ? 45 : 0,
              }}
              mapStyle={MAP_STYLE}
              webGLSupported={webGLSupported}
              webglLost={webglLost}
              mapLoadError={mapLoadError}
              currentPos={currentPos}
              currentHeading={gps.state.heading ?? null}
              showHeadingMarker={gps.state.heading != null}
              rotateHeadingMarker={!isPov}
              routeGeoJSON={remainingRouteGeoJSON}
              routeSourceId="nav-route-tracking"
              routeLayerId="nav-route-tracking-line"
              traceGeoJSON={traceGeoJSON}
              hasSpeedData={hasSpeedData}
              showTrace={positions.length > 1}
              traceSourceId="trace-tracking"
              destination={navigation.destination}
              onLoad={handleTrackingMapLoad}
              onError={handleMapLoadError}
              onMoveStart={handleTrackingMapInteraction}
            />
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col gap-3">
              {!isTrackingMapFollowing && (
                <button
                  type="button"
                  onClick={handleTrackingMapRecenter}
                  aria-label={t("trip.map.recenter")}
                  className="pointer-events-auto flex h-12 min-w-12 items-center justify-center gap-2 self-end rounded-full border border-surface-highest bg-surface-container/90 px-4 text-sm font-bold text-text backdrop-blur active:scale-95"
                >
                  <LocateFixed size={18} className="shrink-0 text-primary" />
                  <span>{t("trip.map.recenter")}</span>
                </button>
              )}
              <div className="pointer-events-auto self-end">
                <MapOrientationButton orientation={orientation} onToggle={toggleOrientation} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* === IDLE / STOPPED / MANUAL: full map === */}
      {uiState !== "tracking" && (
        <div className="relative min-h-0 flex-1" data-testid="idle-map">
          <TripMapCanvas
            mapRef={idleMapRef}
            initialViewState={{
              longitude: currentPos[1],
              latitude: currentPos[0],
              zoom: 15,
              bearing: 0,
              pitch: 0,
            }}
            mapStyle={MAP_STYLE}
            webGLSupported={webGLSupported}
            webglLost={webglLost}
            mapLoadError={mapLoadError}
            currentPos={currentPos}
            currentHeading={null}
            showHeadingMarker={false}
            rotateHeadingMarker={false}
            routeGeoJSON={fullRouteGeoJSON}
            routeSourceId="nav-route-idle"
            routeLayerId="nav-route-idle-line"
            traceGeoJSON={traceGeoJSON}
            hasSpeedData={hasSpeedData}
            showTrace={positions.length > 1}
            traceSourceId="trace-idle"
            destination={navigation.destination}
            onLoad={handleIdleMapLoad}
            onError={handleMapLoadError}
          />
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
            if (window.confirm(t("trip.confirm.abandon"))) {
              recovery.setPendingBackup(null);
              clearStoppedSession();
              setUiState("idle");
              recovery.clearSession();
              gps.reset();
            }
          }}
          onSave={() => {
            if (window.confirm(t("trip.confirm.save"))) {
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
          manualStartedAt={manual.manualStartedAt}
          setManualStartedAt={manual.setManualStartedAt}
          onPresetChange={manual.handleManualPresetChange}
          tripPresets={tripPresets}
          onSubmit={(km, durationSec, startedAtIso) =>
            handleSaveTrip(km, durationSec, null, startedAtIso)
          }
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
        <TripIdleActions
          isSaving={createTrip.isPending}
          destination={navigation.destination}
          destinationLoading={navigation.isLoading}
          onStart={startTracking}
          onOpenDestinationSearch={() => setShowDestinationSearch(true)}
          onClearDestination={() => navigation.clearRoute()}
          onOpenManual={() => {
            manual.resetManualForm();
            setUiState("manual");
          }}
        />
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

      <DestinationSearch
        open={showDestinationSearch}
        onClose={() => setShowDestinationSearch(false)}
        onSelect={(dest) => {
          // Use tracking GPS point if available; fall back to idle geolocation
          const startPoint =
            currentGpsPoint ??
            (initialPos ? { lat: initialPos[0], lng: initialPos[1], ts: Date.now() } : null);
          navigation.setDestination(dest, startPoint);
          setShowDestinationSearch(false);
        }}
      />
    </div>
  );
}
