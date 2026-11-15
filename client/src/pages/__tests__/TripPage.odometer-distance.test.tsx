import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TripPage } from "../TripPage";
import { I18nProvider } from "@/i18n/provider";
import { recordOdometerReading, resetTripOdometer } from "@/lib/trip-odometer";

const renderTripPage = () =>
  render(
    <I18nProvider>
      <TripPage />
    </I18nProvider>,
  );

const mutateMock = vi.fn();
const setStoppedSessionMock = vi.fn().mockReturnValue(true);
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
  limitGpsPoints: (points: unknown[]) => points,
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
  setStoppedSession: (...args: unknown[]) => setStoppedSessionMock(...args),
  clearStoppedSession: vi.fn(),
  hasStoppedSession: () => false,
}));
vi.mock("@/lib/offline-queue", () => ({ queueTrip: vi.fn() }));
vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => false }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => <div>Map fallback</div> }));
vi.mock("@/components/Super73ModeButton", () => ({ Super73ModeButton: () => null }));

vi.mock("@/lib/ble-log", () => ({ bleLog: vi.fn(), describeError: String }));

const STARTED_AT = "2026-11-15T08:00:00.000Z";

describe("TripPage saved distance with a Super73 odometer", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    mutateMock.mockReset();
    setStoppedSessionMock.mockClear();
    resetTripOdometer();
    stopMock.mockReset().mockReturnValue({
      distanceKm: 4,
      durationSec: 900,
      gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: 1 }],
      startedAt: STARTED_AT,
      endedAt: "2026-11-15T08:15:00.000Z",
    });
  });

  async function stopAndSave() {
    renderTripPage();
    await waitFor(() => expect(screen.getByText("Interrompre")).toBeTruthy());
    fireEvent.click(screen.getByText("Interrompre"));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Menu d'interruption du trajet" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  }

  it("sends the odometer-corrected distance, and stores it for retries", async () => {
    // GPS drifted: 3.26 km where the wheel did 3.0 between two odometer steps.
    recordOdometerReading(STARTED_AT, 100.0, 0.05);
    recordOdometerReading(STARTED_AT, 100.1, 0.14);
    recordOdometerReading(STARTED_AT, 103.1, 3.4);

    await stopAndSave();

    expect(mutateMock).toHaveBeenCalledOnce();
    expect(mutateMock.mock.calls[0]![0]).toMatchObject({ distanceKm: 3.74, durationSec: 900 });
    // The persisted session carries the same distance, so a retry after a
    // reload — when the odometer track is gone — cannot fall back to 4 km.
    expect(setStoppedSessionMock.mock.calls[0]![0]).toMatchObject({ distanceKm: 3.74 });
  });

  it("sends the GPS distance when no odometer was recorded", async () => {
    await stopAndSave();

    expect(mutateMock.mock.calls[0]![0]).toMatchObject({ distanceKm: 4 });
  });

  it("sends the GPS distance when the odometer belongs to another trip", async () => {
    recordOdometerReading("2026-11-14T08:00:00.000Z", 100.0, 0.05);
    recordOdometerReading("2026-11-14T08:00:00.000Z", 100.1, 0.14);
    recordOdometerReading("2026-11-14T08:00:00.000Z", 103.1, 3.4);

    await stopAndSave();

    expect(mutateMock.mock.calls[0]![0]).toMatchObject({ distanceKm: 4 });
  });
});
