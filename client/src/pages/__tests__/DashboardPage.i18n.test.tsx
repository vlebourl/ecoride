import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardPage } from "../DashboardPage";
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

vi.mock("/pwa-192x192.png?url", () => ({ default: "/logo.png" }));

vi.mock("react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/hooks/queries", () => ({
  useDashboardSummary: (period: string) => ({
    data:
      period === "day"
        ? {
            totalDistanceKm: 12.4,
            totalCo2SavedKg: 2.1,
            totalMoneySavedEur: 3.4,
            totalFuelSavedL: 1.2,
            tripCount: 2,
            currentStreak: 3,
            longestStreak: 5,
          }
        : {
            totalDistanceKm: 120.5,
            totalCo2SavedKg: 20.3,
            totalMoneySavedEur: 35.4,
            totalFuelSavedL: 12.5,
            tripCount: 8,
            currentStreak: 3,
            longestStreak: 5,
          },
    isPending: false,
  }),
  useProfile: () => ({
    data: {
      user: {
        id: "user-1",
        name: "Lyra",
        consumptionL100: 7,
        super73Enabled: false,
      },
    },
  }),
  useActiveAnnouncement: () => ({ data: null }),
}));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ status: "unsupported", busy: false, toggle: vi.fn() }),
}));

vi.mock("@/lib/offline-queue", () => ({
  getPendingTrips: () => [],
  getRejectedTrips: () => [],
}));

describe("DashboardPage i18n", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  it("renders French copy by default", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    render(
      <I18nProvider>
        <DashboardPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Accueil" })).toBeTruthy();
    expect(screen.getAllByText("Démarrer un trajet").length).toBeGreaterThan(0);
    expect(screen.getByText("GPS ou saisie manuelle")).toBeTruthy();
    expect(screen.getByText("Aujourd'hui")).toBeTruthy();
    expect(screen.getByText("Prochains objectifs")).toBeTruthy();
    expect(screen.getByText("3 jours consécutifs")).toBeTruthy();
  });

  it("renders English copy when the persisted locale is 'en'", () => {
    localStorage.setItem("ecoride-locale", "en");
    render(
      <I18nProvider>
        <DashboardPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
    expect(screen.getAllByText("Start a trip").length).toBeGreaterThan(0);
    expect(screen.getByText("GPS or manual entry")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Next milestones")).toBeTruthy();
    expect(screen.getByText("3 consecutive days")).toBeTruthy();
  });
});
