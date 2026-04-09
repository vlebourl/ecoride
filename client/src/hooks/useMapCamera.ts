import { useState, useEffect, useRef, useCallback } from "react";
import type { MapRef } from "react-map-gl/maplibre";

export interface UseMapCameraOptions {
  bearing?: number | null;
  pitch?: number;
  padding?: { top: number; bottom: number; left: number; right: number };
  enabled: boolean;
}

export interface UseMapCameraResult {
  mapLoadSeq: number;
  setMapLoadSeq: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Flies the map camera to `position` whenever it changes, throttled to 500ms.
 * Returns mapLoadSeq state that should be bumped by the Map's onLoad handler
 * to replay any GPS update that arrived before the map was ready.
 *
 * Updates inside the throttle window are replayed at the trailing edge so the
 * camera never gets stuck behind the latest rider position.
 */
export function useMapCamera(
  mapRef: React.RefObject<MapRef | null>,
  position: [number, number],
  options: UseMapCameraOptions,
): UseMapCameraResult {
  const { bearing, pitch, padding, enabled } = options;
  const flyToRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapLoadSeq, setMapLoadSeq] = useState(0);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearRetryTimer();
      return;
    }

    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return; // map or style not ready; onLoad will replay

    const flyCamera = () => {
      const nextMap = mapRef.current;
      if (!nextMap || !nextMap.isStyleLoaded()) return;
      flyToRef.current = Date.now();
      nextMap.flyTo({
        center: [position[1], position[0]],
        bearing: bearing ?? 0,
        pitch: bearing != null ? (pitch ?? 0) : 0,
        zoom: 15,
        duration: 400,
        ...(padding ? { padding } : {}),
      });
    };

    const remaining = 500 - (Date.now() - flyToRef.current);
    if (remaining <= 0) {
      clearRetryTimer();
      flyCamera();
      return;
    }

    clearRetryTimer();
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      flyCamera();
    }, remaining);

    return clearRetryTimer;
    // flyToRef is a ref (stable) — mapLoadSeq is intentionally listed
    // so onLoad triggers a replay for GPS updates that arrived before the map was ready.
  }, [enabled, position[0], position[1], bearing, pitch, padding, mapLoadSeq, clearRetryTimer]);

  useEffect(() => clearRetryTimer, [clearRetryTimer]);

  return { mapLoadSeq, setMapLoadSeq };
}
