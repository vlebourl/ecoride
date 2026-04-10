import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProfilePage } from "../ProfilePage";
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

const deleteTripPresetMock = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/queries", () => ({
  useProfile: () => ({
    data: {
      user: {
        id: "user-1",
        name: "Lyra",
        email: "lyra@example.com",
        image: null,
        vehicleModel: null,
        fuelType: "sp95",
        consumptionL100: 7,
        mileage: null,
        timezone: null,
        leaderboardOptOut: false,
        reminderEnabled: false,
        reminderTime: null,
        reminderDays: null,
        isAdmin: false,
        super73Enabled: false,
        super73AutoModeEnabled: false,
        super73DefaultMode: null,
        super73DefaultAssist: null,
        super73DefaultLight: null,
        super73AutoModeLowSpeedKmh: null,
        super73AutoModeHighSpeedKmh: null,
        createdAt: "2026-04-08T10:00:00.000Z",
      },
      stats: {
        totalDistanceKm: 100,
        totalCo2SavedKg: 15,
        totalMoneySavedEur: 20,
        totalFuelSavedL: 8,
        tripCount: 12,
      },
    },
    isPending: false,
  }),
  useAchievements: () => ({ data: [], isPending: false }),
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
  useUpdateProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useFuelPrice: () => ({
    data: { priceEur: 1.8, fuelType: "sp95", stationName: "Test" },
    isPending: false,
  }),
  useDeleteAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTripPreset: () => ({ mutate: deleteTripPresetMock, isPending: false }),
  useExportData: () => ({ mutate: vi.fn(), isPending: false }),
  useImportData: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmitFeedback: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    status: "unsupported",
    isPending: false,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/super73-ble", () => ({ isBleSupported: () => false, scanAndConnect: vi.fn() }));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/MapCacheRow", () => ({ MapCacheRow: () => null }));

describe("ProfilePage preset management", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    deleteTripPresetMock.mockReset();
    (globalThis as typeof globalThis & { __APP_VERSION__?: string }).__APP_VERSION__ = "test";
  });

  it("shows trip presets in Profile and deletes them from there", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <I18nProvider>
        <ProfilePage />
      </I18nProvider>,
    );

    expect(screen.getByText("Trajets pré-enregistrés")).toBeTruthy();
    expect(screen.getByText("Domicile → Travail")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Supprimer le trajet pré-enregistré « Domicile → Travail » ?",
    );
    expect(deleteTripPresetMock).toHaveBeenCalledWith("preset-1");
  });
});
