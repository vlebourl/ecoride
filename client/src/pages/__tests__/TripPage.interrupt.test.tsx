import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TripPage } from "../TripPage";
import { I18nProvider } from "@/i18n/provider";

const renderTripPage = () =>
  render(
    <I18nProvider>
      <TripPage />
    </I18nProvider>,
  );

const mutateMock = vi.fn();
const pauseMock = vi.fn();
const stopMock = vi.fn();
const startMock = vi.fn();
const resetMock = vi.fn();
const restoreMock = vi.fn();
const resumeMock = vi.fn();

vi.mock("react-map-gl/maplibre", () => ({
  __esModule: true,
  default: () => null,
  Marker: () => null,
  Source: () => null,
  Layer: () => null,
}));

vi.mock("@/hooks/queries", () => ({
  useCreateTrip: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
  useDeleteTripPreset: () => ({ mutate: vi.fn(), isPending: false }),
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
      isTracking: true,
      isPaused: false,
      distanceKm: 1.23,
      durationSec: 120,
      gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: Date.now() }],
      error: null,
      lastAccuracy: 5,
      speedKmh: 12,
      heading: 90,
    },
    start: startMock,
    stop: stopMock,
    reset: resetMock,
    restore: restoreMock,
    pause: pauseMock,
    resume: resumeMock,
  }),
  getTrackingBackup: () => null,
  clearTrackingBackup: vi.fn(),
  getTrackingSession: () => null,
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

describe("TripPage interrupt finish flow", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    mutateMock.mockReset();
    pauseMock.mockReset();
    stopMock.mockReset();
    startMock.mockReset();
    resetMock.mockReset();
    restoreMock.mockReset();
    resumeMock.mockReset();

    stopMock.mockReturnValue({
      distanceKm: 1.23,
      durationSec: 120,
      gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: 1 }],
      startedAt: "2026-04-08T10:00:00.000Z",
      endedAt: "2026-04-08T10:02:00.000Z",
    });
  });

  it("saves directly from the interrupt menu without asking for save confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderTripPage();

    await waitFor(() => {
      expect(screen.getByText("Interrompre")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Interrompre"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Menu d'interruption du trajet" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(stopMock).toHaveBeenCalledOnce();
    expect(mutateMock).toHaveBeenCalledOnce();
    expect(confirmSpy).not.toHaveBeenCalledWith("Enregistrer ce trajet ?");
  });
});
