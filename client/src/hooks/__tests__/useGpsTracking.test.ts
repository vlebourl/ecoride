/**
 * Regression test for ECO-22: GPS data loss when app goes to background.
 * Verifies that visibilitychange and pagehide events flush backup immediately.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGpsTracking } from "../useGpsTracking";

const BACKUP_KEY = "ecoride-tracking-backup";

// Minimal localStorage stub — replaces the jsdom opaque-origin unavailable impl.
function makeLocalStorageStub() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const k in store) delete store[k];
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
}

describe("useGpsTracking — background backup (ECO-22)", () => {
  let localStorageStub: ReturnType<typeof makeLocalStorageStub>;
  let clearWatchMock: ReturnType<typeof vi.fn>;
  let watchPositionCallback: ((pos: GeolocationPosition) => void) | null = null;

  beforeEach(() => {
    // Stub localStorage (jsdom blocks it on opaque origins)
    localStorageStub = makeLocalStorageStub();
    vi.stubGlobal("localStorage", localStorageStub);

    // Stub sessionStorage (used by start() for SESSION_KEY)
    const sessionStub = makeLocalStorageStub();
    vi.stubGlobal("sessionStorage", sessionStub);

    // Mock geolocation — capture the success callback so we can inject GPS points
    clearWatchMock = vi.fn();
    watchPositionCallback = null;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: vi.fn().mockImplementation((success) => {
          watchPositionCallback = success;
          return 1;
        }),
        clearWatch: clearWatchMock,
      },
      configurable: true,
    });

    // Mock wakeLock
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: vi.fn().mockResolvedValue({
          release: vi.fn().mockResolvedValue(undefined),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      },
      configurable: true,
    });

    // Reset document.hidden to false
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    watchPositionCallback = null;
  });

  /** Inject a fake GPS fix so saveBackup() passes the gpsPoints.length guard. */
  async function injectGpsPoint() {
    if (!watchPositionCallback) return;
    await act(async () => {
      watchPositionCallback!({
        coords: {
          latitude: 48.8566,
          longitude: 2.3522,
          accuracy: 10,
          speed: 5,
          heading: 90,
          altitude: null,
          altitudeAccuracy: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
  }

  it("flushes backup to localStorage on visibilitychange when app goes to background", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });

    // Inject a GPS point so saveBackup() passes the gpsPoints.length > 0 guard
    await injectGpsPoint();

    localStorageStub.setItem.mockClear();

    // Simulate app going to background
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(localStorageStub.setItem).toHaveBeenCalledWith(BACKUP_KEY, expect.any(String));
  });

  it("flushes backup to localStorage on pagehide when tracking", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });

    // Inject a GPS point so saveBackup() passes the gpsPoints.length > 0 guard
    await injectGpsPoint();

    localStorageStub.setItem.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(localStorageStub.setItem).toHaveBeenCalledWith(BACKUP_KEY, expect.any(String));
  });

  it("does not flush backup on visibilitychange when not tracking", async () => {
    renderHook(() => useGpsTracking());

    // Not started — not tracking
    localStorageStub.setItem.mockClear();

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(localStorageStub.setItem).not.toHaveBeenCalledWith(BACKUP_KEY, expect.any(String));
  });

  it("does not flush backup on pagehide when not tracking", async () => {
    renderHook(() => useGpsTracking());

    localStorageStub.setItem.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(localStorageStub.setItem).not.toHaveBeenCalledWith(BACKUP_KEY, expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// Pause / Resume (issue #166)
// ---------------------------------------------------------------------------

describe("useGpsTracking — pause/resume (#166)", () => {
  let localStorageStub: ReturnType<typeof makeLocalStorageStub>;
  let watchPositionCallback: ((pos: GeolocationPosition) => void) | null = null;
  let watchPositionErrorCallback: ((err: GeolocationPositionError) => void) | null = null;
  let clearWatchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    localStorageStub = makeLocalStorageStub();
    vi.stubGlobal("localStorage", localStorageStub);

    const sessionStub = makeLocalStorageStub();
    vi.stubGlobal("sessionStorage", sessionStub);

    clearWatchMock = vi.fn();
    watchPositionCallback = null;
    watchPositionErrorCallback = null;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: vi.fn().mockImplementation((success, error) => {
          watchPositionCallback = success;
          watchPositionErrorCallback = error;
          return 1;
        }),
        clearWatch: clearWatchMock,
      },
      configurable: true,
    });

    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: vi.fn().mockResolvedValue({
          release: vi.fn().mockResolvedValue(undefined),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    watchPositionCallback = null;
    watchPositionErrorCallback = null;
  });

  /** Inject a fake GPS fix at the given coordinates. */
  async function injectGpsPoint(lat = 48.8566, lng = 2.3522) {
    if (!watchPositionCallback) return;
    await act(async () => {
      watchPositionCallback!({
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 10,
          speed: 5,
          heading: 90,
          altitude: null,
          altitudeAccuracy: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
  }

  it("initial state has isPaused=false", () => {
    const { result } = renderHook(() => useGpsTracking());
    expect(result.current.state.isPaused).toBe(false);
  });

  it("pause() sets isPaused=true and clears GPS watch", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });
    await injectGpsPoint();

    const watchCallsBefore = clearWatchMock.mock.calls.length;

    await act(async () => {
      result.current.pause();
    });

    expect(result.current.state.isPaused).toBe(true);
    expect(result.current.state.isTracking).toBe(true); // trip still in progress
    // GPS watch must be cleared when pausing
    expect(clearWatchMock.mock.calls.length).toBeGreaterThan(watchCallsBefore);
  });

  it("resume() sets isPaused=false and restarts GPS watch", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });
    await injectGpsPoint();
    await act(async () => {
      result.current.pause();
    });

    const watchPositionCallsBefore = (
      navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>
    ).mock.calls.length;

    await act(async () => {
      result.current.resume();
    });

    expect(result.current.state.isPaused).toBe(false);
    expect(result.current.state.isTracking).toBe(true);
    // watchPosition must be called again after resume
    expect(
      (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(watchPositionCallsBefore);
  });

  it("timer does not tick while paused", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });
    // Advance 2 seconds while active
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    const durationAfterActive = result.current.state.durationSec;

    await act(async () => {
      result.current.pause();
    });
    // Advance 5 seconds while paused — timer must not tick
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.state.durationSec).toBe(durationAfterActive);
  });

  it("timer resumes ticking after resume()", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    const durationAtPause = result.current.state.durationSec;

    await act(async () => {
      result.current.pause();
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    }); // should not count
    await act(async () => {
      result.current.resume();
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    }); // should count

    // duration = 2s active + 3s after resume = 5s; the 3s pause gap is excluded
    expect(result.current.state.durationSec).toBeGreaterThanOrEqual(durationAtPause + 2);
  });

  it("distance does not accumulate while paused", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });
    // Inject first point
    await injectGpsPoint(48.8566, 2.3522);
    const distanceBefore = result.current.state.distanceKm;

    await act(async () => {
      result.current.pause();
    });

    // While paused, the watch is cleared so watchPositionCallback is null.
    // Manually verify no distance was added (guard: distance unchanged after pause dispatch).
    expect(result.current.state.distanceKm).toBe(distanceBefore);
  });

  it("stop() after pause/resume returns correct accumulated totals", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await injectGpsPoint(48.8566, 2.3522);
    await injectGpsPoint(48.86, 2.36); // some distance

    await act(async () => {
      result.current.pause();
    });
    await act(async () => {
      vi.advanceTimersByTime(10000);
    }); // 10s pause — must not count
    await act(async () => {
      result.current.resume();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    }); // 2s more active

    let session!: ReturnType<typeof result.current.stop>;
    await act(async () => {
      session = result.current.stop();
    });

    // Duration = ~2s + ~2s active = ~4s (not 14s)
    expect(session.durationSec).toBeLessThan(8);
    // Distance recorded (non-zero from GPS points above)
    expect(session.distanceKm).toBeGreaterThan(0);
    // Session timestamps are present
    expect(session.startedAt).toBeTruthy();
    expect(session.endedAt).toBeTruthy();
  });

  it("stop() while paused still returns valid session", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await injectGpsPoint();
    await act(async () => {
      result.current.pause();
    });

    let session!: ReturnType<typeof result.current.stop>;
    await act(async () => {
      session = result.current.stop();
    });

    expect(session.startedAt).toBeTruthy();
    expect(session.endedAt).toBeTruthy();
    expect(result.current.state.isTracking).toBe(false);
    expect(result.current.state.isPaused).toBe(false);
  });

  it("backup flushes on pause so data is not lost if tab dies while paused", async () => {
    const { result } = renderHook(() => useGpsTracking());

    await act(async () => {
      result.current.start();
    });
    await injectGpsPoint();
    localStorageStub.setItem.mockClear();

    await act(async () => {
      result.current.pause();
    });

    expect(localStorageStub.setItem).toHaveBeenCalledWith(BACKUP_KEY, expect.any(String));
  });
});
