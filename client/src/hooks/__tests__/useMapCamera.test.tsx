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

  it("retries flyTo when style is not yet loaded instead of silently dropping the update", () => {
    const flyTo = vi.fn();
    let styleLoaded = false;
    const mapRef = createRef<MapRef | null>();
    mapRef.current = {
      flyTo,
      isStyleLoaded: () => styleLoaded,
    } as unknown as MapRef;

    render(<CameraHarness mapRef={mapRef} position={[48.8566, 2.3522]} />);

    // Style not ready yet — flyTo must not have fired, but a retry should be pending.
    expect(flyTo).not.toHaveBeenCalled();

    // Style finishes loading after a short delay. The pending retry must catch it.
    styleLoaded = true;
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(flyTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [2.3522, 48.8566] }),
    );
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
    expect(flyTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [2.3522, 48.8566] }),
    );

    rerender(<CameraHarness mapRef={mapRef} position={[48.8576, 2.3622]} />);

    expect(flyTo).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(flyTo).toHaveBeenCalledTimes(2);
    expect(flyTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [2.3622, 48.8576] }),
    );
    expect(flyTo).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ zoom: expect.anything() }),
    );
  });
});
