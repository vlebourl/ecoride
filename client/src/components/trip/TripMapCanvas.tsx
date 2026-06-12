import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import type { LayerProps, MapRef } from "react-map-gl/maplibre";
import { MapPin } from "lucide-react";
import { MapNoWebGL } from "@/components/MapNoWebGL";
import { solidTraceLayer, speedTraceLayer, type TraceGeoJSON } from "@/lib/speedGeoJSON";

type RouteFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: number[][] };
  properties: Record<string, unknown>;
};

interface DestinationMarker {
  lat: number;
  lon: number;
}

interface TripMapCanvasProps {
  mapRef: React.RefObject<MapRef | null>;
  initialViewState: {
    longitude: number;
    latitude: number;
    zoom: number;
    bearing?: number;
    pitch?: number;
  };
  mapStyle: string;
  webGLSupported: boolean;
  webglLost: boolean;
  mapLoadError: boolean;
  currentPos: [number, number];
  currentHeading: number | null;
  showHeadingMarker: boolean;
  rotateHeadingMarker: boolean;
  routeGeoJSON: RouteFeature | null;
  routeSourceId: string;
  routeLayerId: string;
  traceGeoJSON: TraceGeoJSON;
  hasSpeedData: boolean;
  showTrace: boolean;
  traceSourceId: string;
  destination: DestinationMarker | null;
  onLoad: (event: { target: maplibregl.Map }) => void;
  onError: () => void;
  onMoveStart?: (evt?: { originalEvent?: unknown }) => void;
}

export function TripMapCanvas({
  mapRef,
  initialViewState,
  mapStyle,
  webGLSupported,
  webglLost,
  mapLoadError,
  currentPos,
  currentHeading,
  showHeadingMarker,
  rotateHeadingMarker,
  routeGeoJSON,
  routeSourceId,
  routeLayerId,
  traceGeoJSON,
  hasSpeedData,
  showTrace,
  traceSourceId,
  destination,
  onLoad,
  onError,
  onMoveStart,
}: TripMapCanvasProps) {
  if (!webGLSupported) return <MapNoWebGL />;

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        attributionControl={false}
        fadeDuration={0}
        style={{ width: "100%", height: "100%" }}
        onLoad={onLoad}
        onError={onError}
        onMoveStart={onMoveStart}
      >
        {routeGeoJSON && (
          <Source id={routeSourceId} type="geojson" data={routeGeoJSON}>
            <Layer
              id={routeLayerId}
              type="line"
              paint={{ "line-color": "#3b82f6", "line-width": 5, "line-opacity": 0.85 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </Source>
        )}
        {showTrace && (
          <Source id={traceSourceId} type="geojson" data={traceGeoJSON}>
            <Layer
              {...((hasSpeedData ? speedTraceLayer : solidTraceLayer) as LayerProps)}
              id={traceSourceId}
            />
          </Source>
        )}
        {destination && (
          <Marker longitude={destination.lon} latitude={destination.lat}>
            <div style={{ color: "#3b82f6" }}>
              <MapPin size={28} fill="currentColor" strokeWidth={1.5} />
            </div>
          </Marker>
        )}
        <Marker longitude={currentPos[1]} latitude={currentPos[0]}>
          {showHeadingMarker && currentHeading != null ? (
            <div
              style={{
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: rotateHeadingMarker ? `rotate(${currentHeading}deg)` : undefined,
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
  );
}
