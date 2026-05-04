import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { forwardRef } from "react";
import { TripPage } from "../TripPage";
import { I18nProvider } from "@/i18n/provider";

const mocks = vi.hoisted(() => ({
  startMock: vi.fn(),
  mutateMock: vi.fn(),
  resetMock: vi.fn(),
  stopMock: vi.fn(),
  restoreMock: vi.fn(),
  pauseMock: vi.fn(),
  resumeMock: vi.fn(),
}));

function renderTripPage() {
  return render(
    <I18nProvider>
      <TripPage />
    </I18nProvider>,
  );
}

vi.mock("react-map-gl/maplibre", () => {
  const MockMap = forwardRef<HTMLDivElement, Record<string, unknown>>(function MockMap(props, _ref) {
    const { children, onMoveStart } = props as {
      children?: React.ReactNode;
      onMoveStart?: (evt: { originalEvent?: unknown }) => void;
    };
    return (
      <div>
        <button
          type="button"
          onClick={() => onMoveStart?.({ originalEvent: { type: "pointerdown" } })}
        >
          simulate-map-interaction
        </button>
        {children}
      </div>
    );
  });

  return {
    __esModule: true,
    default: MockMap,
    Marker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Layer: () => null,
  };
});

vi.mock("@/hooks/queries", () => ({
  useCreateTrip: () => ({
    mutate: mocks.mutateMock,
    isPending: false,
  }),
  useProfile: () => ({
    data: {
      user: {
        consumptionL100: 7,
        super73Enabled: false,
      },
    },
  }),
  useTripPresets: () => ({ data: [] }),
}));

vi.mock("@/hooks/useGpsTracking", () => ({
  useAppGpsTracking: () => ({
    state: {
      isTracking: false,
      isPaused: false,
      distanceKm: 0.4,
      durationSec: 60,
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

vi.mock("@/hooks/useSessionRecovery", () => ({
  useSessionRecovery: () => ({
    initialUiState: null,
    pendingBackup: null,
    sessionRef: { current: null },
    setPendingBackup: vi.fn(),
    setSessionPersistFailed: vi.fn(),
    sessionPersistFailed: false,
    handleRestore: (cb: () => void) => cb(),
    handleDismissBackup: vi.fn(),
  }),
}));

vi.mock("@/hooks/useManualTrip", () => ({
  useManualTrip: () => ({
    manualKm: "",
    setManualKm: vi.fn(),
    manualMinutes: "",
    setManualMinutes: vi.fn(),
    manualPresetId: "custom",
    setManualPresetId: vi.fn(),
    handleManualPresetChange: vi.fn(),
    resetManualForm: vi.fn(),
  }),
}));

vi.mock("@/hooks/useNavigation", () => ({
  useNavigation: () => ({
    destination: null,
    route: null,
    remainingCoordinates: [],
    nextInstruction: null,
    distanceToNextStep: null,
    isLoading: false,
    isArrived: false,
    currentStepType: null,
    clearRoute: vi.fn(),
    setDestination: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSuper73", () => ({
  useSuper73: () => ({
    bikeSpeedKmh: null,
  }),
}));

vi.mock("@/lib/stopped-session", () => ({
  getStoppedSession: () => null,
  setStoppedSession: vi.fn(),
  clearStoppedSession: vi.fn(),
  hasStoppedSession: () => false,
}));

vi.mock("@/lib/offline-queue", () => ({ queueTrip: vi.fn() }));
vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => true }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => <div>Map fallback</div> }));

describe("TripPage map follow mode", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    vi.clearAllMocks();
  });

  it("shows a recenter button after manual map interaction and hides it after recentering", () => {
    renderTripPage();

    fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(screen.queryByRole("button", { name: "Recentrer" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "simulate-map-interaction" }));

    expect(screen.getByRole("button", { name: "Recentrer" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Recentrer" }));

    expect(screen.queryByRole("button", { name: "Recentrer" })).toBeNull();
  });
});
