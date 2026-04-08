import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TripPage } from "../TripPage";

const mutateMock = vi.fn();
const deleteTripPresetMock = vi.fn();
const startMock = vi.fn();
const resetMock = vi.fn();

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
  useDeleteTripPreset: () => ({
    mutate: deleteTripPresetMock,
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
  useTripPresets: () => ({
    data: [
      {
        id: "preset-1",
        userId: "user-1",
        label: "Domicile → Travail",
        distanceKm: 8.4,
        durationSec: 1500,
        gpsPoints: null,
        sourceTripId: null,
        createdAt: "2026-04-08T10:00:00.000Z",
        updatedAt: "2026-04-08T10:00:00.000Z",
      },
    ],
  }),
}));

vi.mock("@/hooks/useGpsTracking", () => ({
  useAppGpsTracking: () => ({
    state: {
      isTracking: false,
      isPaused: false,
      distanceKm: 0,
      durationSec: 0,
      gpsPoints: [],
      error: null,
      lastAccuracy: 5,
      speedKmh: null,
      heading: null,
    },
    start: startMock,
    stop: vi.fn(),
    reset: resetMock,
    restore: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }),
  getTrackingBackup: () => null,
  clearTrackingBackup: vi.fn(),
  getTrackingSession: () => null,
}));

vi.mock("@/lib/offline-queue", () => ({ queueTrip: vi.fn() }));
vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => false }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => <div>Map fallback</div> }));
vi.mock("@/components/Super73ModeButton", () => ({ Super73ModeButton: () => null }));

describe("TripPage trip preset selection", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    deleteTripPresetMock.mockReset();
    startMock.mockReset();
    resetMock.mockReset();
  });

  it("creates a trip directly from a preset and can prefill manual entry", () => {
    render(<TripPage />);

    expect(screen.getByRole("region", { name: "Trajets pré-enregistrés" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    expect(mutateMock).toHaveBeenCalledOnce();
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceKm: 8.4,
        durationSec: 1500,
      }),
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));

    expect(screen.getByDisplayValue("8.4")).toBeTruthy();
    expect(screen.getByDisplayValue("25")).toBeTruthy();
  });

  it("deletes a preset from the management section", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TripPage />);

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Supprimer le trajet pré-enregistré « Domicile → Travail » ?",
    );
    expect(deleteTripPresetMock).toHaveBeenCalledWith("preset-1");
  });
});
