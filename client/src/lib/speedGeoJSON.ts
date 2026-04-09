import type { GpsPoint } from "@ecoride/shared/types";
import type { LayerProps } from "react-map-gl/maplibre";
import { haversineDistance } from "./haversine";

/**
 * Build a GeoJSON FeatureCollection of 2-point line segments,
 * each with a `speed` property (km/h) derived from consecutive GPS points.
 *
 * MapLibre can then color each segment based on the speed value.
 */
export function buildSpeedGeoJSON(points: GpsPoint[]): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: { speed: number };
  }>;
} {
  const features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: { speed: number };
  }> = [];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;

    const dtHours = (curr.ts - prev.ts) / 3_600_000;
    const distKm = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    // Avoid division by zero; clamp to reasonable max (120 km/h for bikes)
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

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

/** Layer style for speed-colored trace — define once, spread into <Layer>. */
export const speedTraceLayer: LayerProps = {
  id: "speed-trace",
  type: "line",
  paint: {
    "line-color": [
      "interpolate",
      ["linear"],
      ["get", "speed"],
      0,
      "#3b82f6", // blue — stopped/slow
      10,
      "#22c55e", // green — moderate
      20,
      "#eab308", // yellow — brisk
      30,
      "#f97316", // orange — fast
      45,
      "#ef4444", // red — very fast
    ],
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
