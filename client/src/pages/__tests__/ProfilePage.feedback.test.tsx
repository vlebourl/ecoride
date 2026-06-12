import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProfilePage } from "../ProfilePage";
import { I18nProvider } from "@/i18n/provider";

const submitFeedbackMock = vi.fn();

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
  useTripPresets: () => ({ data: [] }),
  useUpdateProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useFuelPrice: () => ({ data: null, isPending: false }),
  useDeleteAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTripPreset: () => ({ mutate: vi.fn(), isPending: false }),
  useExportData: () => ({ mutate: vi.fn(), isPending: false }),
  useImportData: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmitFeedback: () => ({ mutate: submitFeedbackMock, isPending: false, isError: false }),
}));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    status: "unsupported",
    busy: false,
    toggle: vi.fn(),
  }),
}));

vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/super73-ble", () => ({ isBleSupported: () => false, scanAndConnect: vi.fn() }));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/MapCacheRow", () => ({ MapCacheRow: () => null }));

describe("ProfilePage feedback section", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    submitFeedbackMock.mockReset();
    submitFeedbackMock.mockImplementation((_vars, options) => options?.onSuccess?.());
    (globalThis as typeof globalThis & { __APP_VERSION__?: string }).__APP_VERSION__ = "test";
  });

  it("clears the thank-you state when the feedback form is reopened", () => {
    render(
      <I18nProvider>
        <ProfilePage />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Signaler un problème" }));
    fireEvent.change(screen.getByPlaceholderText("Titre"), {
      target: { value: "Carte vide" },
    });
    fireEvent.change(screen.getByPlaceholderText("Décrivez le problème ou votre idée..."), {
      target: { value: "La carte reste vide au lancement sur Safari iOS." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));

    expect(screen.getByText("Merci pour votre retour !")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Signaler un problème" }));
    fireEvent.click(screen.getByRole("button", { name: "Signaler un problème" }));

    expect(screen.queryByText("Merci pour votre retour !")).toBeNull();
    expect(screen.getByPlaceholderText("Titre")).toBeTruthy();
  });
});
