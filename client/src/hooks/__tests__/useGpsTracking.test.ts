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
