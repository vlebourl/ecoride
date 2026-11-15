import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { TripPage } from "../TripPage";
import { I18nProvider } from "@/i18n/provider";
import type { AutoTripEnd } from "@/lib/auto-trip";

const mutateMock = vi.fn();
const stopMock = vi.fn();
const startMock = vi.fn();
const resetMock = vi.fn();

const gpsState = {
  isTracking: true,
  isPaused: false,
  distanceKm: 4.4,
  durationSec: 900,
  gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: 1 }],
  error: null,
  lastAccuracy: 5,
  speedKmh: 0,
  heading: 90,
};

let autoStart: () => void = () => {};
let autoStop: (end: AutoTripEnd) => void = () => {};

vi.mock("@/hooks/useAutoTrip", () => ({
  useAutoTripHandlers: (start: () => void, stop: (end: AutoTripEnd) => void) => {
    autoStart = start;
    autoStop = stop;
  },
}));

vi.mock("react-map-gl/maplibre", () => ({
  __esModule: true,
  default: () => null,
  Marker: () => null,
  Source: () => null,
  Layer: () => null,
}));

vi.mock("@/hooks/queries", () => ({
  useCreateTrip: () => ({ mutate: mutateMock, isPending: false }),
  useDeleteTripPreset: () => ({ mutate: vi.fn(), isPending: false }),
  useProfile: () => ({ data: { user: { consumptionL100: 7, super73Enabled: true } } }),
  useTripPresets: () => ({ data: [] }),
}));

vi.mock("@/hooks/useGpsTracking", () => ({
  limitGpsPoints: (points: unknown[]) => points,
  useAppGpsTracking: () => ({
    state: gpsState,
    start: startMock,
    stop: stopMock,
    reset: resetMock,
    restore: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }),
  getTrackingBackup: () => null,
  clearTrackingBackup: vi.fn(),
  getTrackingSession: () => null,
}));

vi.mock("@/lib/stopped-session", () => ({
  getStoppedSession: () => null,
  setStoppedSession: vi.fn(() => true),
  clearStoppedSession: vi.fn(),
  hasStoppedSession: () => false,
}));
vi.mock("@/lib/offline-queue", () => ({ queueTrip: vi.fn() }));
vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => false }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => <div>Map fallback</div> }));
vi.mock("@/components/Super73ModeButton", () => ({ Super73ModeButton: () => null }));

const STARTED_AT = Date.parse("2026-04-08T10:00:00.000Z");
const MIN = 60_000;

const renderTripPage = () =>
  render(
    <I18nProvider>
      <TripPage />
    </I18nProvider>,
  );

describe("TripPage auto start/stop", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    mutateMock.mockReset();
    stopMock.mockReset();
    startMock.mockReset();
    resetMock.mockReset();
    gpsState.isTracking = true;
    // What the GPS hook holds five minutes after the bike was parked.
    stopMock.mockReturnValue({
      distanceKm: 4.4,
      durationSec: 900,
      gpsPoints: [
        { lat: 48.85, lng: 2.35, ts: STARTED_AT },
        { lat: 48.86, lng: 2.36, ts: STARTED_AT + 10 * MIN },
        { lat: 48.87, lng: 2.37, ts: STARTED_AT + 14 * MIN },
      ],
      startedAt: new Date(STARTED_AT).toISOString(),
      endedAt: new Date(STARTED_AT + 15 * MIN).toISOString(),
    });
  });

  it("saves an auto-stopped trip as it was at the last movement, without asking", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderTripPage();

    act(() =>
      autoStop({ at: STARTED_AT + 10 * MIN, distanceKm: 4.2, durationSec: 600, autoStarted: true }),
    );

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0]?.[0]).toMatchObject({
      distanceKm: 4.2,
      durationSec: 600,
      startedAt: "2026-04-08T10:00:00.000Z",
      endedAt: "2026-04-08T10:10:00.000Z",
      gpsPoints: [
        { lat: 48.85, lng: 2.35, ts: STARTED_AT },
        { lat: 48.86, lng: 2.36, ts: STARTED_AT + 10 * MIN },
      ],
    });
  });

  it("discards an auto-started trip that went nowhere instead of saving a phantom", () => {
    renderTripPage();

    act(() =>
      autoStop({
        at: STARTED_AT + 10 * MIN,
        distanceKm: 0.05,
        durationSec: 600,
        autoStarted: true,
      }),
    );

    expect(mutateMock).not.toHaveBeenCalled();
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("starts tracking on request when idle, and ignores the request mid-trip", () => {
    const tracking = renderTripPage();
    act(() => autoStart());
    expect(startMock).not.toHaveBeenCalled();
    tracking.unmount();

    gpsState.isTracking = false;
    renderTripPage();
    act(() => autoStart());
    expect(startMock).toHaveBeenCalledTimes(1);
  });
});
