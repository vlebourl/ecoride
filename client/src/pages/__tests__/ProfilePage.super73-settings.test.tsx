import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

const renderProfile = () =>
  render(
    <I18nProvider>
      <ProfilePage />
    </I18nProvider>,
  );

const mockUser = vi.hoisted(() => ({
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
  super73Enabled: true,
  super73AutoModeEnabled: true,
  super73DefaultMode: "sport",
  super73DefaultAssist: 3,
  super73DefaultLight: true,
  super73AutoModeLowSpeedKmh: 10,
  super73AutoModeHighSpeedKmh: 17,
  createdAt: "2026-04-08T10:00:00.000Z",
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/hooks/queries", () => ({
  useProfile: () => ({
    data: {
      user: mockUser,
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
  useTripPresets: () => ({ data: [] }),
  useUpdateProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useFuelPrice: () => ({
    data: { priceEur: 1.8, fuelType: "sp95", stationName: "Test" },
    isPending: false,
  }),
  useDeleteAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTripPreset: () => ({ mutate: vi.fn(), isPending: false }),
  useExportData: () => ({ mutate: vi.fn(), isPending: false }),
  useImportData: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmitFeedback: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    status: "unsupported",
    isPending: false,
    busy: false,
    toggle: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/super73-ble", () => ({ isBleSupported: () => true, scanAndConnect: vi.fn() }));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));

describe("ProfilePage Super73 settings", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    (globalThis as typeof globalThis & { __APP_VERSION__?: string }).__APP_VERSION__ = "test";
    Object.assign(mockUser, {
      super73Enabled: true,
      super73AutoModeEnabled: true,
      super73DefaultMode: "sport",
      super73DefaultAssist: 3,
      super73DefaultLight: true,
      super73AutoModeLowSpeedKmh: 10,
      super73AutoModeHighSpeedKmh: 17,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not show bike default settings popup (moved to VehiclePage)", () => {
    renderProfile();

    expect(screen.queryByRole("dialog", { name: "Réglages par défaut du vélo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Réglages par défaut du vélo/i })).toBeNull();
  });

  it("shows Vélo connecté toggle when super73 is enabled", () => {
    renderProfile();

    expect(screen.getByText("Vélo connecté (Super73)")).toBeTruthy();
    expect(screen.getByText("Activé")).toBeTruthy();
  });

  it("hides Vélo connecté settings when super73 access is disabled", () => {
    mockUser.super73Enabled = false;

    renderProfile();

    expect(screen.queryByText("Vélo connecté (Super73)")).toBeNull();
  });
});
