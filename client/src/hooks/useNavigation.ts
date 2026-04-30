import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRoute } from "@/lib/ors";
import { haversineDistance } from "@/lib/haversine";
import type { NavigationRoute, GpsPoint } from "@ecoride/shared/types";

const DEVIATION_THRESHOLD_M = 50;
const ACCURACY_THRESHOLD_M = 30;
const RECALCUL_COOLDOWN_MS = 30_000;
const ARRIVAL_THRESHOLD_M = 30;

export interface Destination {
  lat: number;
  lon: number;
  label: string;
}

export interface UseNavigationResult {
  destination: Destination | null;
  route: NavigationRoute | null;
  isLoading: boolean;
  isDeviated: boolean;
  error: string | null;
  nextInstruction: string | null;
  distanceToNextStep: number | null;
  totalRemaining: number | null;
  isArrived: boolean;
  /** ORS maneuver type of the current step (0=left, 1=right, 2=sharp-left, …) */
  currentStepType: number | null;
  /** Coordinates slice from current step start → destination (for remaining-route polyline) */
  remainingCoordinates: [number, number][];
  setDestination: (dest: Destination | null, currentPoint?: GpsPoint | null) => void;
  clearRoute: () => void;
}

// Project a point onto a segment [A, B] and return the squared distance (equirectangular approximation).
// Works well for segments < 50 km.
function pointToSegmentDistanceM(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const cosLat = Math.cos(((pLat + aLat) / 2) * (Math.PI / 180));
  const px = (pLon - aLon) * cosLat;
  const py = pLat - aLat;
  const dx = (bLon - aLon) * cosLat;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : (px * dx + py * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const ex = px - t * dx;
  const ey = py - t * dy;
  // Convert degrees to metres (1° ≈ 111 195 m)
  return Math.sqrt(ex * ex + ey * ey) * 111_195;
}

export function distanceToPolyline(
  lat: number,
  lon: number,
  coordinates: [number, number][],
): number {
  let minDist = Infinity;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    if (!a || !b) continue;
    const [aLon, aLat] = a;
    const [bLon, bLat] = b;
    const d = pointToSegmentDistanceM(lat, lon, aLat, aLon, bLat, bLon);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function findCurrentStepIndex(
  lat: number,
  lon: number,
  route: NavigationRoute,
  currentIndex: number,
): number {
  const steps = route.steps;
  let idx = currentIndex;
  // Walk forward through every maneuver waypoint the rider has *geometrically
  // crossed* and stop at the first one not yet crossed. The crossing test is the
  // sign of (waypoint − prev) · (user − waypoint): negative while approaching,
  // zero at the waypoint, positive once past. This keeps the imminent maneuver
  // visible through the transition zone (issue #294) AND advances correctly even
  // when a single GPS tick lands well past the waypoint (no proximity gate).
  for (let i = currentIndex; i < steps.length - 1; i++) {
    const step = steps[i];
    if (!step) break;
    const waypointIdx = step.wayPoints[1];
    const wpCoord = route.coordinates[waypointIdx];
    if (!wpCoord) break;
    const prevIdx = waypointIdx > step.wayPoints[0] ? waypointIdx - 1 : step.wayPoints[0];
    const prevCoord = route.coordinates[prevIdx];
    if (!prevCoord) break;
    const [wLon, wLat] = wpCoord;
    const [pLon, pLat] = prevCoord;
    const dot = (wLon - pLon) * (lon - wLon) + (wLat - pLat) * (lat - wLat);
    if (dot > 0) {
      idx = i + 1;
      continue;
    }
    break;
  }
  return idx;
}

function computeRemainingDistance(route: NavigationRoute, stepIndex: number): number {
  return route.steps.slice(stepIndex).reduce((sum, s) => sum + s.distance, 0);
}

export function useNavigation({
  currentPoint,
  lastAccuracy,
}: {
  currentPoint: GpsPoint | null;
  lastAccuracy: number | null;
}): UseNavigationResult {
  const [destination, setDestinationState] = useState<Destination | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeviated, setIsDeviated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isArrived, setIsArrived] = useState(false);

  const lastRecalculRef = useRef<number>(0);
  const destinationRef = useRef<Destination | null>(null);
  // Tracks current step index without triggering a re-render — updated synchronously
  // inside the useMemo below so instructions update in the same render as the GPS point.
  const currentStepIndexRef = useRef(0);
  const prevRouteRef = useRef<NavigationRoute | null>(null);

  // Keep ref in sync for use inside effects without stale closures
  destinationRef.current = destination;

  const loadRoute = useCallback(async (startLat: number, startLon: number, dest: Destination) => {
    setIsLoading(true);
    setError(null);
    try {
      const r = await fetchRoute(startLat, startLon, dest.lat, dest.lon);
      setRoute(r);
      currentStepIndexRef.current = 0;
      setIsArrived(false);
      setIsDeviated(false);
      // Reset cooldown after every successful route load (initial + recalculs)
      lastRecalculRef.current = Date.now();
    } catch {
      setError("trip.navigation.fetchError");
      setRoute(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setDestination = useCallback(
    (dest: Destination | null, currentPointArg?: GpsPoint | null) => {
      setDestinationState(dest);
      setRoute(null);
      currentStepIndexRef.current = 0;
      setIsArrived(false);
      setError(null);
      setIsDeviated(false);
      lastRecalculRef.current = 0;

      if (dest && currentPointArg) {
        void loadRoute(currentPointArg.lat, currentPointArg.lng, dest);
      }
    },
    [loadRoute],
  );

  const clearRoute = useCallback(() => {
    setDestinationState(null);
    setRoute(null);
    currentStepIndexRef.current = 0;
    setIsArrived(false);
    setError(null);
    setIsDeviated(false);
    lastRecalculRef.current = 0;
  }, []);

  // Step advancement — synchronous during render so instructions update in the same
  // render cycle as the GPS point (no extra render = no visible lag on the banner).
  const currentStepIndex = useMemo(() => {
    // Reset index when the route object changes (new route loaded or cleared)
    if (route !== prevRouteRef.current) {
      currentStepIndexRef.current = 0;
      prevRouteRef.current = route;
    }
    if (!route || !currentPoint || isArrived) return currentStepIndexRef.current;
    const newIdx = findCurrentStepIndex(
      currentPoint.lat,
      currentPoint.lng,
      route,
      currentStepIndexRef.current,
    );
    currentStepIndexRef.current = newIdx;
    return newIdx;
  }, [route, currentPoint, isArrived]);

  // Side effects only: arrival detection + deviation/recalcul (async, not render-blocking)
  useEffect(() => {
    if (!route || !currentPoint || isArrived) return;

    const lat = currentPoint.lat;
    const lon = currentPoint.lng;

    // Check arrival at destination
    const dest = destinationRef.current;
    if (dest) {
      const distToDest = haversineDistance(lat, lon, dest.lat, dest.lon) * 1000;
      if (distToDest < ARRIVAL_THRESHOLD_M) {
        setIsArrived(true);
        return;
      }
    }

    // Deviation check — only when GPS is accurate enough
    if (lastAccuracy == null || lastAccuracy >= ACCURACY_THRESHOLD_M) return;
    if (Date.now() - lastRecalculRef.current < RECALCUL_COOLDOWN_MS) return;

    const dist = distanceToPolyline(lat, lon, route.coordinates);
    if (dist > DEVIATION_THRESHOLD_M && dest) {
      setIsDeviated(true);
      lastRecalculRef.current = Date.now();
      void loadRoute(lat, lon, dest);
    }
  }, [currentPoint, lastAccuracy, route, isArrived, loadRoute]);

  // Derived values
  const currentStep = route && !isArrived ? (route.steps[currentStepIndex] ?? null) : null;

  // Display the UPCOMING maneuver (step+1) so the user is warned BEFORE the turn,
  // not at the moment they reach it. Fallback to the current step on the last one
  // (which carries the arrival instruction).
  const upcomingStep =
    route && !isArrived ? (route.steps[currentStepIndex + 1] ?? currentStep) : null;

  const nextInstruction = upcomingStep?.instruction ?? null;
  const currentStepType = upcomingStep?.type ?? null;

  // Dynamic distance: metres remaining to the end of the current step (= the turn point).
  let distanceToNextStep: number | null = null;
  if (route && currentStep && currentPoint && !isArrived) {
    const endWaypoint = route.coordinates[currentStep.wayPoints[1]];
    if (endWaypoint) {
      const [wLon, wLat] = endWaypoint;
      distanceToNextStep = haversineDistance(currentPoint.lat, currentPoint.lng, wLat, wLon) * 1000;
    }
  }

  const totalRemaining =
    route && !isArrived ? computeRemainingDistance(route, currentStepIndex) : null;

  // Polyline showing only the portion from current step onward
  const remainingCoordinates: [number, number][] =
    route && !isArrived ? route.coordinates.slice(currentStep?.wayPoints[0] ?? 0) : [];

  return {
    destination,
    route,
    isLoading,
    isDeviated,
    error,
    nextInstruction,
    distanceToNextStep,
    totalRemaining,
    isArrived,
    currentStepType,
    remainingCoordinates,
    setDestination,
    clearRoute,
  };
}
