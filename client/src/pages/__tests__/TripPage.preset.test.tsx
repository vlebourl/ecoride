import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { TripPage } from "../TripPage";
import { I18nProvider } from "@/i18n/provider";
import { ApiError } from "@/lib/api";

const renderTripPage = () =>
  render(
    <I18nProvider>
      <TripPage />
    </I18nProvider>,
  );

const mocks = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  queueTripMock: vi.fn(),
  startMock: vi.fn(),
  resetMock: vi.fn(),
  stopMock: vi.fn(),
  persistMock: vi.fn(),
}));
const { mutateMock, queueTripMock, startMock, resetMock, stopMock, persistMock } = mocks;
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
  limitGpsPoints: (points: unknown[]) => points,
  useAppGpsTracking: () => ({
    state: {
      isTracking: false,
      isPaused: false,
      distanceKm: 1,
      durationSec: 0,
      gpsPoints: [],
      error: null,
      lastAccuracy: 5,
      speedKmh: null,
      heading: null,
    },
    start: mocks.startMock,
    stop: mocks.stopMock,
    reset: mocks.resetMock,
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
  setStoppedSession: mocks.persistMock,
  clearStoppedSession: vi.fn(),
  hasStoppedSession: () => false,
}));
vi.mock("@/lib/offline-queue", () => ({ queueTrip: mocks.queueTripMock }));
vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => false }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => <div>Map fallback</div> }));
vi.mock("@/components/Super73ModeButton", () => ({ Super73ModeButton: () => null }));

describe("TripPage trip preset selection", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    mutateMock.mockReset();
    startMock.mockReset();
    resetMock.mockReset();
    queueTripMock.mockReset();
    stopMock
      .mockReset()
      .mockReturnValue({
        distanceKm: 1,
        durationSec: 60,
        gpsPoints: [],
        startedAt: "2026-04-09T10:00:00.000Z",
        endedAt: "2026-04-09T10:01:00.000Z",
      });
    persistMock.mockReset().mockReturnValue(true);
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

  it("queues a failed manual trip with the same idempotency key used for the live save", () => {
    renderTripPage();

    fireEvent.click(screen.getByRole("button", { name: "Saisie manuelle" }));
    fireEvent.change(screen.getByLabelText("Distance (km)"), { target: { value: "3.2" } });
    fireEvent.change(screen.getByLabelText("Durée (minutes)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(mutateMock).toHaveBeenCalledOnce();
    const [tripData, options] = mutateMock.mock.calls[0] as [
      { idempotencyKey?: string },
      { onError: () => void },
    ];
    expect(tripData).toEqual(
      expect.objectContaining({
        distanceKm: 3.2,
        durationSec: 720,
        gpsPoints: null,
        idempotencyKey: expect.any(String),
      }),
    );

    options.onError();

    expect(queueTripMock).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceKm: 3.2,
        durationSec: 720,
        gpsPoints: null,
        idempotencyKey: tripData.idempotencyKey,
      }),
    );
  });

  it("shows live validation errors instead of queuing them as offline trips", () => {
    renderTripPage();

    fireEvent.click(screen.getByRole("button", { name: "Saisie manuelle" }));
    fireEvent.change(screen.getByLabelText("Distance (km)"), { target: { value: "3.2" } });
    fireEvent.change(screen.getByLabelText("Durée (minutes)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    const [, options] = mutateMock.mock.calls[0] as [
      unknown,
      { onError: (error: unknown) => void },
    ];

    act(() => {
      options.onError(
        new ApiError(
          409,
          JSON.stringify({
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Ce trajet chevauche un trajet existant.",
            },
          }),
        ),
      );
    });

    expect(queueTripMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ce trajet chevauche un trajet existant.")).toBeTruthy();
    expect(
      screen.queryByText("Trajet sauvegardé hors-ligne. Il sera envoyé automatiquement."),
    ).toBeNull();
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

  it("keeps a stopped trip visible and persisted after a rejected save", () => {
    renderTripPage();
    fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));
    fireEvent.click(screen.getByRole("button", { name: "Interrompre le trajet" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Enregistrer" }),
    );
    expect(persistMock).toHaveBeenCalledOnce();
    const [, options] = mutateMock.mock.calls[0] as [
      unknown,
      { onError: (error: unknown) => void },
    ];
    act(() =>
      options.onError(new ApiError(409, JSON.stringify({ error: { message: "Chevauchement" } }))),
    );
    expect(screen.getByText("Chevauchement")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
    expect(queueTripMock).not.toHaveBeenCalled();
  });

  it("queues a stopped trip on 503 with its original key", () => {
    renderTripPage();
    fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));
    fireEvent.click(screen.getByRole("button", { name: "Interrompre le trajet" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Enregistrer" }),
    );
    const [trip, options] = mutateMock.mock.calls[0] as [
      { idempotencyKey: string },
      { onError: (error: unknown) => void },
    ];
    act(() => options.onError(new ApiError(503, "Unavailable")));
    expect(queueTripMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: trip.idempotencyKey }),
    );
  });

  it("keeps the stopped trip when local queue persistence fails", () => {
    queueTripMock.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    renderTripPage();
    fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));
    fireEvent.click(screen.getByRole("button", { name: "Interrompre le trajet" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Enregistrer" }),
    );
    const [, options] = mutateMock.mock.calls[0] as [
      unknown,
      { onError: (error: unknown) => void },
    ];
    act(() => options.onError(new ApiError(503, "Unavailable")));
    expect(
      screen.getByText("Enregistrement local impossible. Gardez cette page ouverte et réessayez."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
    expect(resetMock).not.toHaveBeenCalled();
  });
});
