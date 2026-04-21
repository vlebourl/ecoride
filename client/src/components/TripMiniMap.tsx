import { useState, useMemo, useEffect, useRef } from "react";
import Map, { Source, Layer, useMap } from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
import type { GpsPoint } from "@ecoride/shared/types";
import { isWebGLSupported } from "@/lib/webgl";
import {
  buildTraceGeoJSON,
  speedTraceLayer,
  solidTraceLayer,
  SPEED_LEGEND,
} from "@/lib/speedGeoJSON";
import { MapNoWebGL } from "@/components/MapNoWebGL";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

function FitBoundsOnLoad({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map) return;
    // Delay fitBounds until after the bottom sheet slide-up animation (0.2s)
    // completes. Without this, MapLibre doesn't know the container's final
    // dimensions and calculates the wrong center/zoom (#103).
    const timer = setTimeout(() => {
      map.resize();
      map.fitBounds(bounds, { padding: 20 });
    }, 250);
    return () => clearTimeout(timer);
  }, [map, bounds]);
  return null;
}

export function TripMiniMap({ gpsPoints }: { gpsPoints: GpsPoint[] }) {
  const webGLSupported = isWebGLSupported();
  const [webglLost, setWebglLost] = useState(false);
  const mapStyleReadyRef = useRef(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const traceGeoJSON = useMemo(() => buildTraceGeoJSON(gpsPoints), [gpsPoints]);
  const hasSpeedData = traceGeoJSON.type === "FeatureCollection";
  // Single-pass bounds computation: avoids Math.min/max spread which throws
  // RangeError when trips exceed ~65k GPS points (JS call-stack limit).
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const p of gpsPoints) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  const bounds: [[number, number], [number, number]] = [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;

  return (
    <div className="relative mb-4 h-48 overflow-hidden rounded-xl">
      {webGLSupported ? (
        <>
          <Map
            initialViewState={{
              longitude: centerLng,
              latitude: centerLat,
              zoom: 13,
            }}
            mapStyle={MAP_STYLE}
            attributionControl={false}
            dragPan={false}
            scrollZoom={false}
            doubleClickZoom={false}
            touchZoomRotate={false}
            style={{ width: "100%", height: "100%" }}
            onLoad={(e) => {
              mapStyleReadyRef.current = true;
              setMapLoadError(false);
              setWebglLost(false);
              const m = e.target;
              m.on("webglcontextlost", () => setWebglLost(true));
              m.on("webglcontextrestored", () => setWebglLost(false));
            }}
            onError={() => {
              if (!mapStyleReadyRef.current) setMapLoadError(true);
            }}
          >
            <Source id="trace-stats" type="geojson" data={traceGeoJSON}>
              <Layer
                {...((hasSpeedData ? speedTraceLayer : solidTraceLayer) as LayerProps)}
                id="trace-stats"
              />
            </Source>
            <FitBoundsOnLoad bounds={bounds} />
          </Map>
          {(webglLost || mapLoadError) && (
            <div className="absolute inset-0">
              <MapNoWebGL />
            </div>
          )}
          {hasSpeedData && (
            <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-md bg-bg/80 px-2 py-1 text-[10px] text-text-dim backdrop-blur-sm">
              {SPEED_LEGEND.map((s) => (
                <div key={s.label} className="flex flex-col items-center">
                  <div className="h-1.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />
                  <span>{s.label}</span>
                </div>
              ))}
              <span className="ml-1">km/h</span>
            </div>
          )}
        </>
      ) : (
        <MapNoWebGL />
      )}
    </div>
  );
}
