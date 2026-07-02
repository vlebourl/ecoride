import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StatsPage } from "../StatsPage";
import { I18nProvider } from "@/i18n/provider";

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
};

const createTripPresetFromTripMutate = vi.fn();
const deleteTripMutate = vi.fn();

vi.mock("react-map-gl/maplibre", () => ({
  __esModule: true,
  default: () => null,
  Source: () => null,
  Layer: () => null,
  useMap: () => ({ current: null }),
}));

vi.mock("@/hooks/queries", () => ({
  useDashboardSummary: () => ({
    data: {
      totalDistanceKm: 12,
      totalCo2SavedKg: 3,
      totalMoneySavedEur: 4,
      totalFuelSavedL: 1,
      tripCount: 1,
      currentStreak: 1,
      longestStreak: 1,
    },
    isPending: false,
  }),
  useAllTrips: () => ({
    data: {
      trips: [
        {
          id: "trip-1",
          userId: "user-1",
          distanceKm: 8.4,
          durationSec: 1500,
          co2SavedKg: 1.2,
          moneySavedEur: 2.1,
          fuelSavedL: 0.5,
          fuelPriceEur: 1.8,
          startedAt: "2026-04-08T07:00:00.000Z",
          endedAt: "2026-04-08T07:25:00.000Z",
          gpsPoints: null,
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    },
    isPending: false,
  }),
  useTrip: () => ({ data: null }),
  useChartTrips: () => ({ data: [], isPending: false }),
  useAchievements: () => ({ data: [], isPending: false }),
  useProfile: () => ({ data: { user: { timezone: "Europe/Paris" } } }),
  useDeleteTrip: () => ({ mutate: deleteTripMutate, isPending: false }),
  useCreateTripPresetFromTrip: () => ({
    mutate: createTripPresetFromTripMutate,
    isPending: false,
  }),
}));

vi.mock("@/lib/trip-utils", () => ({
  tripLabel: () => "Trajet domicile-travail",
  tripLabelKey: () => "stats.tripLabel.morning",
}));

vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => false }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => <div>Map fallback</div> }));

describe("StatsPage preset creation flow", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    createTripPresetFromTripMutate.mockReset();
    createTripPresetFromTripMutate.mockImplementation((_vars, options) => options?.onSuccess?.());
    deleteTripMutate.mockReset();
  });

  it("opens an inline form and creates a preset without relying on window.prompt", async () => {
    render(
      <I18nProvider>
        <StatsPage />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Trajet du matin/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Détail du trajet" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Créer un trajet pré-enregistré" }));

    const input = screen.getByLabelText("Nom du trajet pré-enregistré") as HTMLInputElement;
    expect(input.value).toBe("domicile-travail");

    fireEvent.change(input, { target: { value: "Maison → Bureau" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(createTripPresetFromTripMutate).toHaveBeenCalledWith(
      {
        tripId: "trip-1",
        label: "Maison → Bureau",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Détail du trajet" })).toBeNull();
      expect(screen.getByText("Trajet pré-enregistré créé.")).toBeTruthy();
    });
  });
});
