import { useCallback, useEffect, useRef, useState } from "react";
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
  // Search from current step onward — steps advance monotonically
  for (let i = currentIndex; i < steps.length - 1; i++) {
    const step = steps[i];
    if (!step) continue;
    const waypointIdx = step.wayPoints[1];
    const coord = route.coordinates[waypointIdx];
    if (!coord) continue;
    const [wLon, wLat] = coord;
    const distToWaypoint = haversineDistance(lat, lon, wLat, wLon) * 1000;
    if (distToWaypoint > step.distance * 1.2) continue;
    if (distToWaypoint < 20) return i + 1;
  }
  return currentIndex;
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
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isArrived, setIsArrived] = useState(false);

  const lastRecalculRef = useRef<number>(0);
  const destinationRef = useRef<Destination | null>(null);

  // Keep ref in sync for use inside effects without stale closures
  destinationRef.current = destination;

  const loadRoute = useCallback(async (startLat: number, startLon: number, dest: Destination) => {
    setIsLoading(true);
    setError(null);
    try {
      const r = await fetchRoute(startLat, startLon, dest.lat, dest.lon);
      setRoute(r);
      setCurrentStepIndex(0);
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
      setCurrentStepIndex(0);
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
    setCurrentStepIndex(0);
    setIsArrived(false);
    setError(null);
    setIsDeviated(false);
    lastRecalculRef.current = 0;
  }, []);

  // Deviation detection + step advancement
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

    // Advance step
    const newStepIndex = findCurrentStepIndex(lat, lon, route, currentStepIndex);
    if (newStepIndex !== currentStepIndex) {
      setCurrentStepIndex(newStepIndex);
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
  }, [currentPoint, lastAccuracy, route, currentStepIndex, isArrived, loadRoute]);

  // Derived values
  const nextInstruction =
    route && !isArrived ? (route.steps[currentStepIndex]?.instruction ?? null) : null;

  const distanceToNextStep =
    route && !isArrived ? (route.steps[currentStepIndex]?.distance ?? null) : null;

  const totalRemaining =
    route && !isArrived ? computeRemainingDistance(route, currentStepIndex) : null;

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
    setDestination,
    clearRoute,
  };
}
