import { createRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapRef } from "react-map-gl/maplibre";
import { useMapCamera } from "../useMapCamera";

interface CameraHarnessProps {
  mapRef: React.RefObject<MapRef | null>;
  position: [number, number];
  enabled?: boolean;
}

function CameraHarness({ mapRef, position, enabled = true }: CameraHarnessProps) {
  useMapCamera(mapRef, position, { enabled });
  return null;
}

describe("useMapCamera", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // isStyleLoaded() is false while any tile loads or a GeoJSON source was just
  // updated — constantly while riding. Gating the camera on it left the map
  // behind the rider.
  it("follows the rider even while the style reports tiles still loading", () => {
    const flyTo = vi.fn();
    const mapRef = createRef<MapRef | null>();
    mapRef.current = {
      flyTo,
      isStyleLoaded: () => false,
    } as unknown as MapRef;

    render(<CameraHarness mapRef={mapRef} position={[48.8566, 2.3522]} />);

    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [2.3522, 48.8566] }));
    expect(flyTo).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ zoom: expect.anything() }),
    );
  });

  it("replays the latest position after the throttle window instead of dropping it", () => {
    const flyTo = vi.fn();
    const mapRef = createRef<MapRef | null>();
    mapRef.current = {
      flyTo,
      isStyleLoaded: () => true,
    } as unknown as MapRef;

    const { rerender } = render(<CameraHarness mapRef={mapRef} position={[48.8566, 2.3522]} />);

    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [2.3522, 48.8566] }));

    rerender(<CameraHarness mapRef={mapRef} position={[48.8576, 2.3622]} />);

    expect(flyTo).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(flyTo).toHaveBeenCalledTimes(2);
    expect(flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [2.3622, 48.8576] }));
    expect(flyTo).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ zoom: expect.anything() }),
    );
  });
});
