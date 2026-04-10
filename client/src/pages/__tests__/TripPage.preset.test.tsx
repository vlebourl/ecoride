import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TripPage } from "../TripPage";
import { I18nProvider } from "@/i18n/provider";

const renderTripPage = () =>
  render(
    <I18nProvider>
      <TripPage />
    </I18nProvider>,
  );

const mutateMock = vi.fn();
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
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    mutateMock.mockReset();
    startMock.mockReset();
    resetMock.mockReset();
  });

  it("creates a manual trip from the manual dropdown preset selection", () => {
    renderTripPage();

    fireEvent.click(screen.getByRole("button", { name: "Saisie manuelle" }));
    fireEvent.change(screen.getByLabelText("Trajet pré-enregistré"), {
      target: { value: "preset-1" },
    });

    expect(screen.getByDisplayValue("8.4")).toBeTruthy();
    expect(screen.getByDisplayValue("25")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(mutateMock).toHaveBeenCalledOnce();
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceKm: 8.4,
        durationSec: 1500,
      }),
      expect.any(Object),
    );
  });

  it("resets the fields when switching back to custom mode", () => {
    renderTripPage();

    fireEvent.click(screen.getByRole("button", { name: "Saisie manuelle" }));
    fireEvent.change(screen.getByLabelText("Trajet pré-enregistré"), {
      target: { value: "preset-1" },
    });
    fireEvent.change(screen.getByLabelText("Trajet pré-enregistré"), {
      target: { value: "custom" },
    });

    expect((screen.getByLabelText("Distance (km)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Durée (minutes)") as HTMLInputElement).value).toBe("");
  });
});
