import type { GpsPoint } from "@ecoride/shared/types";
import { haversineDistance } from "./haversine";

/** Check whether GPS points have valid timestamps for speed calculation. */
function hasValidTimestamps(points: GpsPoint[]): boolean {
  if (points.length < 2) return false;
  let distinctTs = 0;
  for (const p of points) {
    if (typeof p.ts === "number" && p.ts > 0) {
      distinctTs++;
      if (distinctTs >= 2) return true;
    }
  }
  return false;
}

type SpeedFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: { speed: number };
  }>;
};

type SimpleLineFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: Record<string, never>;
};

export type TraceGeoJSON = SpeedFeatureCollection | SimpleLineFeature;

/**
 * Build GeoJSON for a trip trace.
 *
 * If points have valid timestamps: returns a FeatureCollection of 2-point
 * segments colored by speed. Otherwise: returns a single LineString feature
 * for a solid-color fallback.
 */
export function buildTraceGeoJSON(points: GpsPoint[]): TraceGeoJSON {
  if (!hasValidTimestamps(points)) {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points.map((p) => [p.lng, p.lat] as [number, number]),
      },
      properties: {},
    };
  }

  const features: SpeedFeatureCollection["features"] = [];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;

    const dtHours = (curr.ts - prev.ts) / 3_600_000;
    const distKm = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    const speed = dtHours > 0 ? Math.min(distKm / dtHours, 120) : 0;

    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [prev.lng, prev.lat],
          [curr.lng, curr.lat],
        ],
      },
      properties: { speed },
    });
  }

  return { type: "FeatureCollection" as const, features };
}

/**
 * Layer props for speed-colored trace segments.
 * Typed as Record to avoid importing react-map-gl (which pulls CSS into this chunk).
 */
export const speedTraceLayer: Record<string, unknown> = {
  id: "speed-trace",
  type: "line",
  paint: {
    "line-color": [
      "interpolate",
      ["linear"],
      ["get", "speed"],
      0,
      "#3b82f6",
      10,
      "#22c55e",
      20,
      "#eab308",
      30,
      "#f97316",
      45,
      "#ef4444",
    ],
    "line-width": 4,
    "line-opacity": 0.9,
  },
  layout: {
    "line-cap": "round",
    "line-join": "round",
  },
};

/** Layer props for solid-color fallback (old trips without timestamps). */
export const solidTraceLayer: Record<string, unknown> = {
  id: "solid-trace",
  type: "line",
  paint: {
    "line-color": "#2ecc71",
    "line-width": 4,
    "line-opacity": 0.9,
  },
  layout: {
    "line-cap": "round",
    "line-join": "round",
  },
};

/** Speed thresholds and colors for the legend. */
export const SPEED_LEGEND = [
  { label: "0", color: "#3b82f6" },
  { label: "10", color: "#22c55e" },
  { label: "20", color: "#eab308" },
  { label: "30", color: "#f97316" },
  { label: "45+", color: "#ef4444" },
] as const;
