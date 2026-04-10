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
const getRejectedTripsMock = vi.fn(() => []);
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

vi.mock("/pwa-192x192.png?url", () => ({ default: "/logo.png" }));

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
  getRejectedTrips: () => getRejectedTripsMock(),
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
    getRejectedTripsMock.mockReset();
    getRejectedTripsMock.mockReturnValue([]);
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
  it("shows rejected sync trips separately from pending ones", () => {
    useActiveAnnouncementMock.mockReturnValue({ data: null });
    getPendingTripsMock.mockReturnValue([
      {
        distanceKm: 1,
        durationSec: 60,
        startedAt: "2026-04-09T10:00:00.000Z",
        endedAt: "2026-04-09T10:01:00.000Z",
      },
    ]);
    getRejectedTripsMock.mockReturnValue([
      {
        trip: {
          distanceKm: 2,
          durationSec: 120,
          startedAt: "2026-04-09T11:00:00.000Z",
          endedAt: "2026-04-09T11:02:00.000Z",
        },
        rejectedAt: "2026-04-09T12:00:00.000Z",
        status: 409,
        reason: "Trajet rejeté : chevauchement avec un trajet déjà enregistré.",
      },
    ]);

    render(<DashboardPage />);

    expect(screen.getByText(/1 trajet en attente de synchronisation/i)).toBeTruthy();
    expect(screen.getByText(/1 trajet rejeté lors de la synchronisation/i)).toBeTruthy();
  });

  it("allows dismissing the rejected sync warning until a new rejection appears", () => {
    useActiveAnnouncementMock.mockReturnValue({ data: null });
    getRejectedTripsMock.mockReturnValue([
      {
        trip: {
          distanceKm: 2,
          durationSec: 120,
          startedAt: "2026-04-09T11:00:00.000Z",
          endedAt: "2026-04-09T11:02:00.000Z",
        },
        rejectedAt: "2026-04-09T12:00:00.000Z",
        status: 409,
        reason: "Trajet rejeté : chevauchement avec un trajet déjà enregistré.",
      },
    ]);

    const { rerender } = render(<DashboardPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Fermer l'avertissement de synchronisation" }),
    );
    expect(screen.queryByText(/trajet rejeté lors de la synchronisation/i)).toBeNull();

    rerender(<DashboardPage />);
    expect(screen.queryByText(/trajet rejeté lors de la synchronisation/i)).toBeNull();

    getRejectedTripsMock.mockReturnValue([
      {
        trip: {
          distanceKm: 3,
          durationSec: 180,
          startedAt: "2026-04-09T13:00:00.000Z",
          endedAt: "2026-04-09T13:03:00.000Z",
        },
        rejectedAt: "2026-04-09T13:05:00.000Z",
        status: 400,
        reason: "Trajet rejeté : données incompatibles avec la version actuelle.",
      },
    ]);

    rerender(<DashboardPage />);
    expect(screen.getByText(/trajet rejeté lors de la synchronisation/i)).toBeTruthy();
  });
});
