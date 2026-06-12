import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripPage } from "../TripPage";
import { I18nProvider } from "@/i18n/provider";

const mocks = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  startMock: vi.fn(),
  stopMock: vi.fn(),
  resetMock: vi.fn(),
  restoreMock: vi.fn(),
  pauseMock: vi.fn(),
  resumeMock: vi.fn(),
  useSuper73Mock: vi.fn(),
}));

function renderTripPage() {
  return render(
    <I18nProvider>
      <TripPage />
    </I18nProvider>,
  );
}

vi.mock("react-map-gl/maplibre", () => ({
  __esModule: true,
  default: () => null,
  Marker: () => null,
  Source: () => null,
  Layer: () => null,
}));

vi.mock("@/hooks/queries", () => ({
  useCreateTrip: () => ({
    mutate: mocks.mutateMock,
    isPending: false,
  }),
  useDeleteTripPreset: () => ({ mutate: vi.fn(), isPending: false }),
  useProfile: () => ({
    data: {
      user: {
        consumptionL100: 7,
        super73Enabled: true,
      },
    },
  }),
  useTripPresets: () => ({ data: [] }),
}));

vi.mock("@/hooks/useGpsTracking", () => ({
  useAppGpsTracking: () => ({
    state: {
      isTracking: true,
      isPaused: false,
      distanceKm: 1.23,
      durationSec: 120,
      gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: 1 }],
      error: null,
      lastAccuracy: 5,
      speedKmh: 12,
      heading: 90,
    },
    start: mocks.startMock,
    stop: mocks.stopMock,
    reset: mocks.resetMock,
    restore: mocks.restoreMock,
    pause: mocks.pauseMock,
    resume: mocks.resumeMock,
  }),
  getTrackingBackup: () => null,
  clearTrackingBackup: vi.fn(),
  getTrackingSession: () => null,
}));

vi.mock("@/hooks/useSuper73", () => ({
  useSuper73: () => mocks.useSuper73Mock(),
}));

vi.mock("@/lib/stopped-session", () => ({
  getStoppedSession: () => null,
  setStoppedSession: vi.fn(),
  clearStoppedSession: vi.fn(),
  hasStoppedSession: () => false,
}));
vi.mock("@/lib/offline-queue", () => ({ queueTrip: vi.fn() }));
vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => false }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => <div>Map fallback</div> }));
vi.mock("@/components/Super73ModeButton", () => ({ Super73ModeButton: () => null }));

function connectedSuper73State() {
  return {
    status: "connected",
    bikeState: { mode: "race", assist: 3, light: true, region: "eu" },
    bikeSpeedKmh: 32.4,
    batteryPercent: 75,
    rangeKm: 45,
    error: null,
    tripModeSelection: "race",
    connect: vi.fn(),
    disconnect: vi.fn(),
    setMode: vi.fn(),
    setAssist: vi.fn(),
    setLight: vi.fn(),
    toggleMode: vi.fn(),
    cycleTripModeSelection: vi.fn(),
    epacPollFallbackWarning: false,
    dismissEpacPollFallback: vi.fn(),
  };
}

describe("TripPage Super73 tracking UI", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    vi.clearAllMocks();
    mocks.useSuper73Mock.mockReturnValue(connectedSuper73State());
  });

  it("shows battery, range, assist, and classe gauges while tracking with a connected Super73", () => {
    renderTripPage();

    expect(screen.getByTestId("battery-indicator")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText(/45\s*km/i)).toBeTruthy();
    expect(screen.getByLabelText("Assistance 3/4")).toBeTruthy();
    expect(screen.getByLabelText("Classe 4/4")).toBeTruthy();
  });
});
