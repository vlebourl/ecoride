import { describe, it, expect } from "vitest";
import { buildSpeedGeoJSON } from "../speedGeoJSON";
import type { GpsPoint } from "@ecoride/shared/types";

describe("buildSpeedGeoJSON", () => {
  it("returns empty FeatureCollection for 0 or 1 point", () => {
    expect(buildSpeedGeoJSON([]).features).toHaveLength(0);
    expect(buildSpeedGeoJSON([{ lat: 48, lng: 2, ts: 1000 }]).features).toHaveLength(0);
  });

  it("creates one segment per consecutive pair", () => {
    const points: GpsPoint[] = [
      { lat: 48.0, lng: 2.0, ts: 0 },
      { lat: 48.001, lng: 2.001, ts: 10_000 },
      { lat: 48.002, lng: 2.002, ts: 20_000 },
    ];
    const result = buildSpeedGeoJSON(points);
    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(2);
  });

  it("calculates speed in km/h from distance and time", () => {
    // ~111m apart, 10 seconds → ~40 km/h
    const points: GpsPoint[] = [
      { lat: 48.0, lng: 2.0, ts: 0 },
      { lat: 48.001, lng: 2.0, ts: 10_000 },
    ];
    const speed = buildSpeedGeoJSON(points).features[0]!.properties.speed;
    expect(speed).toBeGreaterThan(30);
    expect(speed).toBeLessThan(50);
  });

  it("clamps speed to 120 km/h", () => {
    // Very far, very short time → should be clamped
    const points: GpsPoint[] = [
      { lat: 48.0, lng: 2.0, ts: 0 },
      { lat: 49.0, lng: 2.0, ts: 1000 }, // 111km in 1s
    ];
    const speed = buildSpeedGeoJSON(points).features[0]!.properties.speed;
    expect(speed).toBe(120);
  });

  it("handles zero time delta gracefully", () => {
    const points: GpsPoint[] = [
      { lat: 48.0, lng: 2.0, ts: 1000 },
      { lat: 48.001, lng: 2.001, ts: 1000 }, // same timestamp
    ];
    const speed = buildSpeedGeoJSON(points).features[0]!.properties.speed;
    expect(speed).toBe(0);
  });
});
