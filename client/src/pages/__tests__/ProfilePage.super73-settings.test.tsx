import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProfilePage } from "../ProfilePage";

const updateProfileMutateMock = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
        super73Enabled: true,
        super73AutoModeEnabled: true,
        super73DefaultMode: "sport",
        super73DefaultAssist: 3,
        super73DefaultLight: true,
        super73AutoModeLowSpeedKmh: 10,
        super73AutoModeHighSpeedKmh: 17,
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
  useTripPresets: () => ({ data: [] }),
  useUpdateProfile: () => ({ mutate: updateProfileMutateMock, isPending: false }),
  useFuelPrice: () => ({
    data: { priceEur: 1.8, fuelType: "sp95", stationName: "Test" },
    isPending: false,
  }),
  useDeleteAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTripPreset: () => ({ mutate: vi.fn(), isPending: false }),
  useExportData: () => ({ mutate: vi.fn(), isPending: false }),
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

describe("ProfilePage Super73 settings sheet", () => {
  beforeEach(() => {
    updateProfileMutateMock.mockReset();
    (globalThis as typeof globalThis & { __APP_VERSION__?: string }).__APP_VERSION__ = "test";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps Super73 defaults hidden until the settings sheet is opened", () => {
    render(<ProfilePage />);

    expect(screen.queryByRole("dialog", { name: "Réglages par défaut du vélo" })).toBeNull();
    expect(screen.queryByText(/^Mode$/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Réglages par défaut du vélo/i }));

    expect(screen.getByRole("dialog", { name: "Réglages par défaut du vélo" })).toBeTruthy();
    expect(screen.getByText(/^Mode$/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fermer les réglages du vélo" }));

    expect(screen.queryByRole("dialog", { name: "Réglages par défaut du vélo" })).toBeNull();
  });
});
