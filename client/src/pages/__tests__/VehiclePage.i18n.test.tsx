import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VehiclePage } from "../VehiclePage";
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

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
        super73AutoModeEnabled: false,
        super73DefaultMode: "eco",
        super73DefaultAssist: 0,
        super73DefaultLight: false,
        super73AutoModeLowSpeedKmh: 10,
        super73AutoModeHighSpeedKmh: 17,
        createdAt: "2026-04-08T10:00:00.000Z",
      },
    },
    isLoading: false,
  }),
  useUpdateProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useSuper73", () => ({
  useSuper73: () => ({ status: "disconnected", bikeState: null }),
}));

vi.mock("@/lib/super73-ble", () => ({ isBleSupported: () => true }));
vi.mock("@/components/Super73ModeButton", () => ({ Super73ModeButton: () => null }));

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

describe("VehiclePage i18n", () => {
  it("renders French copy by default", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    render(
      <I18nProvider>
        <VehiclePage />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Mode auto en trajet" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Réglages par défaut" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer le mode auto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer les réglages" })).toBeTruthy();
  });

  it("renders English copy when the persisted locale is 'en'", () => {
    localStorage.setItem("ecoride-locale", "en");
    render(
      <I18nProvider>
        <VehiclePage />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Auto mode during trip" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Default settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save auto mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeTruthy();
  });
});
