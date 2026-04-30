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
    // Look-ahead: while on step 0, the banner shows the UPCOMING maneuver (step 1).
    // Step 1 has type 1 (right) per the fixture.
    expect(result.current.currentStepType).toBe(1);
    expect(result.current.nextInstruction).toBe("Tournez à gauche");
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

    // Move far off-route with good accuracy — but cooldown not elapsed (2s < 5s).
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    rerender({ point: { lat: 49.0, lng: 2.3, ts: 2_000 } }); // way off route

    expect(mockFetch.mock.calls.length).toBe(callsBefore); // no recalcul yet
  });

  it("triggers recalcul within ≤5 s of going off-route (regression: bike-speed responsiveness)", async () => {
    // At bike speed, 5 s of stale routing is enough to commit to the wrong
    // street. RECALCUL_COOLDOWN_MS was 30 s — after a recalcul fired, a rider
    // who deviated again had to wait half a minute for another route. New
    // cooldown is 5 s, the responsiveness floor required by the user.
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    const callsBefore = mockFetch.mock.calls.length;

    // Advance just past the 5 s cooldown (matches the user requirement).
    act(() => {
      vi.advanceTimersByTime(5_100);
    });

    // Mock fetch to pend (not resolve) so isDeviated stays true during loading
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves

    // Move far off-route (lat 49.0 = many km north of route at lat ~48.8x)
    act(() => {
      rerender({ point: { lat: 49.0, lng: 2.3, ts: 5_100 } });
    });

    // Fetch was called again (recalcul triggered within the responsiveness window)
    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(result.current.isDeviated).toBe(true);
  });

  it("does NOT issue a second recalcul while one is already in-flight (regression: no overlapping reroutes)", async () => {
    // Codex stop-time review caught this: with cooldown reduced to 5 s, two
    // recalculs can overlap if the first fetch is slow — and a stale resolution
    // could overwrite the newer route. Fix: skip the deviation check while
    // isLoading is true.
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    // Make the initial fetch hang so isLoading stays true.
    let resolveInitial: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | null =
      null;
    mockFetch.mockReturnValueOnce(
      new Promise((res) => {
        resolveInitial = res;
      }),
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    expect(result.current.isLoading).toBe(true);
    const callsBefore = mockFetch.mock.calls.length; // = 1

    // Push past cooldown AND off-route. Without the isLoading guard this would
    // trigger a second fetch overlapping the first.
    act(() => {
      vi.advanceTimersByTime(5_100);
    });
    rerender({ point: { lat: 49.0, lng: 2.3, ts: 5_100 } });

    expect(mockFetch.mock.calls.length).toBe(callsBefore); // no overlapping fetch

    // Resolve the initial fetch so the test cleans up cleanly.
    await act(async () => {
      resolveInitial?.({
        ok: true,
        json: async () => ({ ok: true, data: { route: FIXTURE_ROUTE } }),
      });
    });
  });

  it("ignores stale fetch responses (regression: late response cannot overwrite newer route)", async () => {
    // Codex stop-time review caught this: a setDestination call while a previous
    // fetch is in-flight starts a second fetch. If the first (slow) fetch
    // resolves AFTER the second, it would overwrite the newer route. Fix: a
    // request-ID counter in loadRoute discards responses whose request was
    // superseded.
    const ROUTE_A: NavigationRoute = { ...FIXTURE_ROUTE, totalDistance: 1111 };
    const ROUTE_B: NavigationRoute = { ...FIXTURE_ROUTE, totalDistance: 2222 };

    const { result } = renderHook(() =>
      useNavigation({
        currentPoint: { lat: 48.8566, lng: 2.3522, ts: 0 },
        lastAccuracy: 10,
      }),
    );

    // First fetch: pending, will resolve LATE with ROUTE_A.
    let resolveA: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | null = null;
    mockFetch.mockReturnValueOnce(
      new Promise((res) => {
        resolveA = res;
      }),
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    // Second fetch: resolves immediately with ROUTE_B (newer destination).
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { route: ROUTE_B } }),
    });

    await act(async () => {
      result.current.setDestination(
        { lat: 48.7, lon: 2.0, label: "B" },
        { lat: 48.8566, lng: 2.3522, ts: 0 },
      );
    });

    expect(result.current.route).toEqual(ROUTE_B);

    // Now resolve the first (stale) fetch with ROUTE_A. It must NOT overwrite ROUTE_B.
    await act(async () => {
      resolveA?.({
        ok: true,
        json: async () => ({ ok: true, data: { route: ROUTE_A } }),
      });
    });

    expect(result.current.route).toEqual(ROUTE_B);
  });

  it("instructions update in the same render as the GPS point — no extra act() needed (regression #271)", async () => {
    // Bug: step advancement was in a useEffect, so instructions lagged one render
    // behind the map position. Fix: useMemo computes step index synchronously during render.
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    // Look-ahead: while on step 0, the banner shows the UPCOMING maneuver (step 1).
    expect(result.current.nextInstruction).toBe("Tournez à gauche");

    // Move just past the waypoint that ends step 0 (toward coords[2]) — close enough
    // to trigger the dot-product crossing check. Rerender only, no extra act().
    rerender({ point: { lat: 48.8398, lng: 2.2998, ts: 1000 } });

    // Step index advanced to 1 → banner now shows the next upcoming maneuver (step 2).
    // Must update immediately, in the same render — not one cycle later.
    expect(result.current.nextInstruction).toBe("Tournez à droite");
    expect(result.current.currentStepType).toBe(2);
  });

  it("advances past short route steps even when a tick lands well beyond step.distance (regression: short-step gate)", async () => {
    // Codex stop-time review caught this: with the gate at step.distance * 1.2,
    // a 30 m step had a 36 m gate — a single fast tick landing 80 m past such
    // a short maneuver never satisfied the gate, so step advancement was stuck.
    // Fix: an absolute floor (~200 m) on the gate keeps short steps advanceable
    // while the proportional term still blocks wildly off-route GPS on long ones.

    // Custom fixture: route with a SHORT 30 m step sandwiched between two longer
    // ones. Coordinates are colinear (lat 48.84, increasing lon) for clarity.
    const SHORT_STEP_ROUTE: NavigationRoute = {
      coordinates: [
        [2.3, 48.84], // start
        [2.30274, 48.84], // ≈200 m east — end of step 0
        [2.30315, 48.84], // ≈30 m further east — end of step 1 (the short one)
        [2.31, 48.84], // ≈500 m further east — destination
      ],
      steps: [
        { instruction: "Continuez", distance: 200, duration: 30, type: 0, wayPoints: [0, 1] },
        { instruction: "Tournez à droite", distance: 30, duration: 5, type: 1, wayPoints: [1, 2] },
        {
          instruction: "Tournez à gauche",
          distance: 500,
          duration: 90,
          type: 0,
          wayPoints: [2, 3],
        },
      ],
      totalDistance: 730,
      totalDuration: 125,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { route: SHORT_STEP_ROUTE } }),
    });

    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.84, lng: 2.3, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(
        { lat: 48.84, lon: 2.31, label: "End" },
        { lat: 48.84, lng: 2.3, ts: 0 },
      );
    });

    // Single tick lands ~80 m past coords[2] (end of the short 30 m step).
    // distToWaypoint(coords[2]) ≈ 80 m; step 1 distance × 1.2 = 36 m → would
    // have broken without the absolute floor. With the floor (200 m) it passes.
    rerender({ point: { lat: 48.84, lng: 2.30425, ts: 1000 } });

    // Step index advanced past coords[1] AND coords[2] → idx = 2.
    // remainingCoordinates starts at coords[2] = the third element, so length = 2.
    expect(result.current.remainingCoordinates.length).toBe(2);
    // On the last step, upcomingStep falls back to currentStep itself.
    expect(result.current.nextInstruction).toBe("Tournez à gauche");
    expect(result.current.currentStepType).toBe(0);
  });

  it("does NOT skip short-step maneuvers when GPS is laterally off-route (regression: off-route + short steps)", async () => {
    // Codex stop-time review caught this: with the gate at max(step.distance × 1.2, 200 m),
    // a slightly-off-route GPS reading (e.g. 100 m laterally) past a SHORT step's
    // waypoint still satisfied the 200 m floor and the dot-product test, advancing
    // through short maneuvers it should not have. Fix: the gate is the lateral
    // distance to the route polyline (DEVIATION_THRESHOLD_M = 50 m), not the
    // distance to a specific waypoint — short or long, off-route is off-route.

    const SHORT_STEP_ROUTE: NavigationRoute = {
      coordinates: [
        [2.3, 48.84],
        [2.30274, 48.84],
        [2.30315, 48.84],
        [2.31, 48.84],
      ],
      steps: [
        { instruction: "Continuez", distance: 200, duration: 30, type: 0, wayPoints: [0, 1] },
        { instruction: "Tournez à droite", distance: 30, duration: 5, type: 1, wayPoints: [1, 2] },
        {
          instruction: "Tournez à gauche",
          distance: 500,
          duration: 90,
          type: 0,
          wayPoints: [2, 3],
        },
      ],
      totalDistance: 730,
      totalDuration: 125,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { route: SHORT_STEP_ROUTE } }),
    });
    // Pend any subsequent recalcul so the route doesn't reset under us.
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.84, lng: 2.3, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(
        { lat: 48.84, lon: 2.31, label: "End" },
        { lat: 48.84, lng: 2.3, ts: 0 },
      );
    });

    // User is laterally ~110 m north of the (lat 48.84) route AND lon-wise
    // positioned past the short-step waypoint at coords[2]. The dot-product test
    // would happily advance through both short steps, but the lateral distance
    // to the polyline (~110 m) exceeds DEVIATION_THRESHOLD_M (50 m) — the gate
    // must block advancement so the rider sees the imminent maneuver, not the
    // ones they geometrically "passed" while drifting.
    rerender({ point: { lat: 48.841, lng: 2.30425, ts: 1000 } });

    // Step did NOT advance: still on step 0 → banner shows step 1's maneuver.
    expect(result.current.nextInstruction).toBe("Tournez à droite");
    expect(result.current.currentStepType).toBe(1);
  });

  it("does NOT skip maneuvers when GPS jumps far off-route (regression: off-route safety)", async () => {
    // Codex stop-time review caught this: with no proximity gate, a wildly
    // off-route GPS reading can satisfy the dot-product crossing test for
    // multiple step waypoints in sequence (purely by approach-direction
    // geometry) and permanently skip maneuvers. Fix: require distance to the
    // waypoint to be within ~1.2 × the step's own length before the crossing
    // check counts.
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    // Pend any recalcul fetch so the route doesn't reset under us.
    mockFetch.mockReturnValue(new Promise(() => {}));

    // GPS jumps hundreds of km away — far beyond any plausible step length.
    // Without the plausibility gate, the dot product against the SW-pointing
    // approach vector happens to be positive for both coords[1] and coords[2],
    // which would skip two maneuvers. With the gate, neither test runs.
    rerender({ point: { lat: 50.0, lng: 1.0, ts: 1000 } });

    expect(result.current.nextInstruction).toBe("Tournez à gauche");
    expect(result.current.currentStepType).toBe(1);
  });

  it("advances even when a single GPS tick lands well past the waypoint (regression: stuck after real turn)", async () => {
    // Codex stop-time review caught this: with the previous "< 50 m AND past"
    // gate, a fast rider whose next GPS fix landed >50 m past the maneuver
    // (e.g. high speed, sparse fixes) would never satisfy the proximity check —
    // step advancement got stuck and the banner remained on the maneuver the
    // rider had already executed. Fix: rely solely on the dot-product crossing
    // test, no proximity gate.
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    // Tick lands ~750 m past coords[1] *along* step 1's segment (i.e. on-route),
    // far beyond any small proximity window but laterally close to the polyline.
    // (48.835, 2.275) sits exactly on the line from coords[1] to coords[2].
    rerender({ point: { lat: 48.835, lng: 2.275, ts: 1000 } });

    expect(result.current.nextInstruction).toBe("Tournez à droite");
    expect(result.current.currentStepType).toBe(2);
  });

  it("does NOT skip the imminent maneuver inside the transition zone (regression #294 follow-up)", async () => {
    // Codex stop-time review caught this: the previous look-ahead fix advanced the step
    // index as soon as the user was within 20 m of the waypoint, which made
    // upcomingStep = steps[i+2] right when the rider was actually executing the
    // maneuver — so the banner flipped to the *next-next* instruction during the turn.
    // Fix: the step index now only advances once the user has geometrically crossed
    // the waypoint (dot-product check), so the imminent maneuver stays on screen
    // through the entire transition.
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    // Right at the waypoint that ends step 0 — within 20 m of the maneuver point but
    // not yet past it. Banner MUST still show "Tournez à gauche" (step 1), NOT
    // "Tournez à droite" (step 2).
    rerender({ point: { lat: 48.84, lng: 2.3, ts: 1000 } });
    expect(result.current.nextInstruction).toBe("Tournez à gauche");
    expect(result.current.currentStepType).toBe(1);

    // Now move just past the waypoint along the route — banner switches to step 2.
    rerender({ point: { lat: 48.8398, lng: 2.2998, ts: 1100 } });
    expect(result.current.nextInstruction).toBe("Tournez à droite");
    expect(result.current.currentStepType).toBe(2);
  });

  it("displays the upcoming maneuver while still on the current step (regression #294)", async () => {
    // Bug #294: while on rue X, the banner used to show "Continue on rue X" until the
    // user was 20 m from the intersection — too late at bike speed (≈5 s of warning).
    // Fix: while traversing step i, display step i+1's instruction so the user is warned
    // BEFORE the turn, with a dynamic distance counting down to the maneuver point.
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    // At the very start of step 0, far from the maneuver: banner already announces step 1.
    expect(result.current.nextInstruction).toBe("Tournez à gauche");
    expect(result.current.currentStepType).toBe(1);
    // Distance to next step is dynamic — should be the haversine distance to coords[1],
    // i.e. several kilometres, not the static step.distance value (5000 m).
    const initialDistance = result.current.distanceToNextStep;
    expect(initialDistance).not.toBeNull();
    expect(initialDistance).toBeGreaterThan(1000);

    // Halfway between coords[0] and coords[1] — still on step 0, instruction unchanged,
    // but distance to maneuver should have shrunk significantly.
    rerender({ point: { lat: (48.8566 + 48.84) / 2, lng: (2.3522 + 2.3) / 2, ts: 500 } });

    expect(result.current.nextInstruction).toBe("Tournez à gauche");
    expect(result.current.currentStepType).toBe(1);
    expect(result.current.distanceToNextStep).not.toBeNull();
    expect(result.current.distanceToNextStep!).toBeLessThan(initialDistance!);
  });

  it("falls back to the current step's instruction on the last step", async () => {
    // On the final step there is no "next" maneuver — keep showing the current step's
    // instruction (typically the arrival/goal text from ORS) instead of going blank.
    const { result, rerender } = renderHook(
      ({ point }: { point: { lat: number; lng: number; ts: number } }) =>
        useNavigation({ currentPoint: point, lastAccuracy: 10 }),
      { initialProps: { point: { lat: 48.8566, lng: 2.3522, ts: 0 } } },
    );

    await act(async () => {
      result.current.setDestination(FIXTURE_DESTINATION, { lat: 48.8566, lng: 2.3522, ts: 0 });
    });

    // Walk through the route: step 0 → step 1 → step 2 (last step). Each rerender
    // moves *past* the corresponding waypoint to satisfy the crossing check.
    rerender({ point: { lat: 48.8398, lng: 2.2998, ts: 1000 } }); // past coords[1]
    rerender({ point: { lat: 48.8198, lng: 2.1998, ts: 2000 } }); // past coords[2]

    // Now on the final step (index 2). No step 3 exists → fallback to step 2's own values.
    expect(result.current.nextInstruction).toBe("Tournez à droite");
    expect(result.current.currentStepType).toBe(2);
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

    // Move just past the end-waypoint of step 0 (coords[1] = lon=2.3, lat=48.84) along
    // the route to satisfy the crossing check that triggers step advancement.
    rerender({ point: { lat: 48.8398, lng: 2.2998, ts: 1000 } });

    // After advancing to step 1, remainingCoordinates starts at coords[1]
    expect(result.current.remainingCoordinates.length).toBeLessThan(initialLength);
    // Look-ahead: while on step 1, the banner shows step 2's type (2 = sharp-left in fixture).
    expect(result.current.currentStepType).toBe(2);
  });
});
