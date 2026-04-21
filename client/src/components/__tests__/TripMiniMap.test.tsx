import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripMiniMap } from "../TripMiniMap";
import type { GpsPoint } from "@ecoride/shared/types";

// vi.hoisted ensures the stable ref is available inside the vi.mock factory (which is hoisted).
const { fitBounds, resize, mockMapRef } = vi.hoisted(() => {
  const fitBounds = vi.fn();
  const resize = vi.fn();
  const mockMapRef = { current: { fitBounds, resize } };
  return { fitBounds, resize, mockMapRef };
});

vi.mock("react-map-gl/maplibre", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Source: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
  useMap: () => mockMapRef,
}));

vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => true }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => null }));

const GPS_POINTS: GpsPoint[] = [
  { lat: 45.0, lng: 6.0, ts: 1000 },
  { lat: 45.1, lng: 6.1, ts: 10_000 },
];

describe("TripMiniMap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fitBounds.mockClear();
    resize.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers fitBounds to the next animation frame after resize (regression: fitBounds was called synchronously with resize, before container settled)", () => {
    render(<TripMiniMap gpsPoints={GPS_POINTS} />);

    // Before the 250ms delay, nothing should fire.
    expect(resize).not.toHaveBeenCalled();
    expect(fitBounds).not.toHaveBeenCalled();

    // After the delay, resize fires but fitBounds must wait for rAF.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(resize).toHaveBeenCalledTimes(1);
    expect(fitBounds).not.toHaveBeenCalled();

    // Flush the pending requestAnimationFrame — now fitBounds fires.
    act(() => {
      vi.runAllTimers();
    });
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds).toHaveBeenCalledWith(
      [
        [6.0, 45.0],
        [6.1, 45.1],
      ],
      { padding: 20 },
    );
  });

  it("does not re-call fitBounds when the parent re-renders with the same GPS points", () => {
    const { rerender } = render(<TripMiniMap gpsPoints={GPS_POINTS} />);

    act(() => {
      vi.advanceTimersByTime(250);
      vi.runAllTimers();
    });
    expect(fitBounds).toHaveBeenCalledTimes(1);

    // Re-render with the same GPS_POINTS reference — bounds are memoized, no re-fit.
    rerender(<TripMiniMap gpsPoints={GPS_POINTS} />);

    act(() => {
      vi.runAllTimers();
    });
    expect(fitBounds).toHaveBeenCalledTimes(1);
  });
});
