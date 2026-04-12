import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNavigation, distanceToPolyline } from "../useNavigation";
import type { NavigationRoute } from "@ecoride/shared/types";

// ---- Fixture helpers ----

/** Straight W-E route: Paris lon=2.3522 → Versailles lon=2.0900, lat=48.80 */
const FIXTURE_ROUTE: NavigationRoute = {
  coordinates: [
    [2.3522, 48.8566],
    [2.3, 48.84],
    [2.2, 48.82],
    [2.09, 48.8],
  ],
  steps: [
    {
      instruction: "Continuez tout droit",
      distance: 5000,
      duration: 900,
      type: 0,
      wayPoints: [0, 1],
    },
    { instruction: "Tournez à gauche", distance: 3000, duration: 600, type: 1, wayPoints: [1, 2] },
    { instruction: "Tournez à droite", distance: 2000, duration: 400, type: 2, wayPoints: [2, 3] },
  ],
  totalDistance: 10000,
  totalDuration: 1900,
};

const FIXTURE_DESTINATION = { lat: 48.8, lon: 2.09, label: "Versailles" };

// Stub fetch for ORS proxy calls
const mockFetch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, data: { route: FIXTURE_ROUTE } }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

// ---- distanceToPolyline unit tests ----

describe("distanceToPolyline", () => {
  it("returns ~0 for a point exactly on the line", () => {
    // Midpoint between first two coords
    const midLat = (48.8566 + 48.84) / 2;
    const midLon = (2.3522 + 2.3) / 2;
    const dist = distanceToPolyline(midLat, midLon, FIXTURE_ROUTE.coordinates);
    expect(dist).toBeLessThan(10); // < 10m
  });

  it("returns a positive distance for a point off the route", () => {
    // Point ~500m north of the route
    const dist = distanceToPolyline(48.9, 2.3, FIXTURE_ROUTE.coordinates);
    expect(dist).toBeGreaterThan(0);
  });

  it("returns Infinity for empty coordinates", () => {
    const dist = distanceToPolyline(48.85, 2.35, []);
    expect(dist).toBe(Infinity);
  });
});

// ---- useNavigation hook tests ----

describe("useNavigation", () => {
  it("starts with no destination or route", () => {
    const { result } = renderHook(() => useNavigation({ currentPoint: null, lastAccuracy: null }));
    expect(result.current.destination).toBeNull();
    expect(result.current.route).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("setDestination fetches route when currentPoint provided", async () => {
    const { result } = renderHook(() =>
      useNavigation({
        currentPoint: { lat: 48.8566, lng: 2.3522, ts: 0 },
        lastAccuracy: 10,
      }),
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    expect(result.current.destination).toEqual(FIXTURE_DESTINATION);
    expect(result.current.route).toEqual(FIXTURE_ROUTE);
    expect(result.current.isLoading).toBe(false);
    // currentStepType: first step has type 0 (straight)
    expect(result.current.currentStepType).toBe(0);
    // remainingCoordinates: full route from step 0 wayPoint[0]=0
    expect(result.current.remainingCoordinates).toEqual(FIXTURE_ROUTE.coordinates);
  });

  it("clearRoute resets all state", async () => {
    const { result } = renderHook(() =>
      useNavigation({
        currentPoint: { lat: 48.8566, lng: 2.3522, ts: 0 },
        lastAccuracy: 10,
      }),
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    act(() => {
      result.current.clearRoute();
    });

    expect(result.current.destination).toBeNull();
    expect(result.current.route).toBeNull();
    expect(result.current.isArrived).toBe(false);
  });

  it("does NOT trigger recalcul when accuracy >= 30m (faux positif GPS)", async () => {
    const { result, rerender } = renderHook(
      ({ accuracy }: { accuracy: number }) =>
        useNavigation({
          currentPoint: { lat: 48.9, lng: 2.3, ts: 0 }, // >50m off route
          lastAccuracy: accuracy,
        }),
      { initialProps: { accuracy: 50 } },
    );

    // Set route without calling fetch (inject directly via setDestination but with no currentPoint)
    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION);
    });

    // Inject the route manually by calling setDestination with a currentPoint
    // Actually route won't be set without currentPoint — so set it
    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    const callsBefore = mockFetch.mock.calls.length;

    // Update accuracy to "bad" (>=30m) — deviation check should be skipped
    rerender({ accuracy: 50 });

    // Advance timers past cooldown
    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(mockFetch.mock.calls.length).toBe(callsBefore); // no new fetch
  });

  it("does NOT trigger recalcul within cooldown period", async () => {
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    // Set route from starting point
    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    const callsBefore = mockFetch.mock.calls.length;

    // Move far off-route with good accuracy — but cooldown not elapsed
    act(() => {
      vi.advanceTimersByTime(10_000);
    }); // 10s < 30s cooldown
    rerender({ point: { lat: 49.0, lng: 2.3, ts: 10_000 } }); // way off route

    expect(mockFetch.mock.calls.length).toBe(callsBefore); // no recalcul yet
  });

  it("triggers recalcul when deviation >50m, accuracy <30m, cooldown elapsed", async () => {
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    const callsBefore = mockFetch.mock.calls.length;

    // Advance past cooldown
    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    // Mock fetch to pend (not resolve) so isDeviated stays true during loading
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves

    // Move far off-route (lat 49.0 = many km north of route at lat ~48.8x)
    act(() => {
      rerender({ point: { lat: 49.0, lng: 2.3, ts: 31_000 } });
    });

    // Fetch was called again (recalcul triggered)
    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    // isDeviated stays true while recalculating (isLoading is true, route not yet updated)
    expect(result.current.isDeviated).toBe(true);
  });

  it("remainingCoordinates shrinks as steps advance", async () => {
    // Start at the waypoint that ends step 0 (coord index 1) to trigger step advancement
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    // At step 0, remainingCoordinates starts at coords[0] → full route
    const initialLength = result.current.remainingCoordinates.length;
    expect(initialLength).toBe(FIXTURE_ROUTE.coordinates.length);

    // Move very close to the end-waypoint of step 0 (coord index 1: lon=2.3, lat=48.84)
    // step 0 distance=5000m, so distToWaypoint < 20m triggers advancement
    rerender({ point: { lat: 48.84, lng: 2.3, ts: 1000 } });

    // After advancing to step 1, remainingCoordinates starts at coords[1]
    expect(result.current.remainingCoordinates.length).toBeLessThan(initialLength);
    // currentStepType should now be step 1's type (1 = right turn)
    expect(result.current.currentStepType).toBe(1);
  });
});
