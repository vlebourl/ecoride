import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardPage } from "../DashboardPage";

const activeAnnouncement = {
  id: "announcement-new",
  title: "Maintenance ce soir",
  body: "Interruption prévue à 22h.",
  url: null,
  active: true,
  createdAt: "2026-04-09T10:00:00.000Z",
};

const useActiveAnnouncementMock = vi.fn();
const getPendingTripsMock = vi.fn(() => []);

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
};

vi.mock("react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
          }
        : {
            totalDistanceKm: 120.5,
            totalCo2SavedKg: 20.3,
            totalMoneySavedEur: 35.4,
            totalFuelSavedL: 12.5,
            tripCount: 8,
          },
    isPending: false,
  }),
  useProfile: () => ({
    data: {
      user: {
        id: "user-1",
        name: "Lyra",
        super73Enabled: false,
      },
    },
  }),
  useActiveAnnouncement: () => useActiveAnnouncementMock(),
}));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    status: "unsupported",
    busy: false,
    toggle: vi.fn(),
  }),
}));

vi.mock("@/lib/offline-queue", () => ({
  getPendingTrips: () => getPendingTripsMock(),
}));

describe("DashboardPage announcement banner", () => {
  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    useActiveAnnouncementMock.mockReset();
    getPendingTripsMock.mockReset();
    getPendingTripsMock.mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    storage.clear();
  });

  it("shows a newly active announcement even if an older one was dismissed", () => {
    localStorage.setItem("ecoride:ann-dismissed", "announcement-old");
    useActiveAnnouncementMock.mockReturnValue({ data: activeAnnouncement });

    render(<DashboardPage />);

    expect(screen.getByTestId("announcement-banner")).toBeTruthy();
    expect(screen.getByText("Maintenance ce soir")).toBeTruthy();
  });

  it("stores the current announcement id when dismissed", () => {
    useActiveAnnouncementMock.mockReturnValue({ data: activeAnnouncement });

    render(<DashboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "Fermer l'annonce" }));

    expect(localStorage.getItem("ecoride:ann-dismissed")).toBe("announcement-new");
    expect(screen.queryByTestId("announcement-banner")).toBeNull();
  });
});
