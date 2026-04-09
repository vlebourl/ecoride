import { describe, it, expect } from "vitest";
import { buildTraceGeoJSON } from "../speedGeoJSON";
import type { GpsPoint } from "@ecoride/shared/types";

describe("buildTraceGeoJSON", () => {
  it("returns single LineString for 0 or 1 point", () => {
    const result = buildTraceGeoJSON([]);
    expect(result.type).toBe("Feature");
    expect((result as any).geometry.coordinates).toHaveLength(0);
  });

  it("returns single LineString when points have no timestamps", () => {
    const points = [
      { lat: 48.0, lng: 2.0, ts: 0 },
      { lat: 48.001, lng: 2.001, ts: 0 },
      { lat: 48.002, lng: 2.002, ts: 0 },
    ] as GpsPoint[];
    const result = buildTraceGeoJSON(points);
    expect(result.type).toBe("Feature");
    expect((result as any).geometry.type).toBe("LineString");
    expect((result as any).geometry.coordinates).toHaveLength(3);
  });

  it("returns single LineString when ts is missing", () => {
    const points = [
      { lat: 48.0, lng: 2.0 },
      { lat: 48.001, lng: 2.001 },
    ] as unknown as GpsPoint[];
    const result = buildTraceGeoJSON(points);
    expect(result.type).toBe("Feature");
  });

  it("returns FeatureCollection with speed segments when timestamps valid", () => {
    const points: GpsPoint[] = [
      { lat: 48.0, lng: 2.0, ts: 1000 },
      { lat: 48.001, lng: 2.001, ts: 11_000 },
      { lat: 48.002, lng: 2.002, ts: 21_000 },
    ];
    const result = buildTraceGeoJSON(points);
    expect(result.type).toBe("FeatureCollection");
    expect((result as any).features).toHaveLength(2);
  });

  it("calculates speed in km/h from distance and time", () => {
    // ~111m apart, 10 seconds → ~40 km/h
    const points: GpsPoint[] = [
      { lat: 48.0, lng: 2.0, ts: 1000 },
      { lat: 48.001, lng: 2.0, ts: 11_000 },
    ];
    const result = buildTraceGeoJSON(points);
    expect(result.type).toBe("FeatureCollection");
    const speed = (result as any).features[0].properties.speed;
    expect(speed).toBeGreaterThan(30);
    expect(speed).toBeLessThan(50);
  });

  it("clamps speed to 120 km/h", () => {
    const points: GpsPoint[] = [
      { lat: 48.0, lng: 2.0, ts: 1000 },
      { lat: 49.0, lng: 2.0, ts: 2000 }, // 111km in 1s
    ];
    const result = buildTraceGeoJSON(points);
    const speed = (result as any).features[0].properties.speed;
    expect(speed).toBe(120);
  });

  it("handles zero time delta gracefully within speed segments", () => {
    // Two valid ts + one duplicate ts pair
    const points: GpsPoint[] = [
      { lat: 48.0, lng: 2.0, ts: 1000 },
      { lat: 48.001, lng: 2.001, ts: 1000 }, // same ts
      { lat: 48.002, lng: 2.002, ts: 11_000 },
    ];
    const result = buildTraceGeoJSON(points);
    expect(result.type).toBe("FeatureCollection");
    const speed0 = (result as any).features[0].properties.speed;
    expect(speed0).toBe(0);
  });
});
