import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  useTrips: () => ({
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
  useDeleteTrip: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateTripPresetFromTrip: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/webgl", () => ({ isWebGLSupported: () => false }));
vi.mock("@/components/MapNoWebGL", () => ({ MapNoWebGL: () => <div>Map fallback</div> }));

describe("StatsPage i18n", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  it("renders French copy by default", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    render(
      <I18nProvider>
        <StatsPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Statistiques" })).toBeTruthy();
    expect(screen.getByText("Ce mois")).toBeTruthy();
    expect(screen.getByText("Distance Totale")).toBeTruthy();
    expect(screen.getByText("CO₂ Économisé")).toBeTruthy();
    expect(screen.getByText("Évolution")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Semaine" })).toBeTruthy();
    expect(screen.getByText("Activité récente")).toBeTruthy();
  });

  it("renders English copy when the persisted locale is 'en'", () => {
    localStorage.setItem("ecoride-locale", "en");
    render(
      <I18nProvider>
        <StatsPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Statistics" })).toBeTruthy();
    expect(screen.getByText("This month")).toBeTruthy();
    expect(screen.getByText("Total distance")).toBeTruthy();
    expect(screen.getByText("CO₂ saved")).toBeTruthy();
    expect(screen.getByText("Trend")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Week" })).toBeTruthy();
    expect(screen.getByText("Recent activity")).toBeTruthy();
  });
});
