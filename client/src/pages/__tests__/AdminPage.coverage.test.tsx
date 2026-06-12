import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "../AdminPage";
import { I18nProvider } from "@/i18n/provider";

const navigateMock = vi.fn();
const triggerDeployMutateMock = vi.fn();
const grantAdminMutateMock = vi.fn();
const revokeAdminMutateMock = vi.fn();
const grantSuper73AccessMutateMock = vi.fn();
const revokeSuper73AccessMutateMock = vi.fn();
const deleteAdminUserMutateMock = vi.fn();

const state = vi.hoisted(() => ({
  profilePending: false,
  profileData: {
    user: {
      id: "admin-1",
      name: "Lyra Admin",
      email: "admin@example.com",
      isAdmin: true,
    },
  },
  healthPending: false,
  health: {
    version: "2.48.0",
    uptime: 3661,
    userCount: 12,
    tripCount: 34,
    tripsToday: 5,
    tripsThisWeek: 11,
    dbConnected: true,
    dbSizeMb: 42.3,
  },
  statsPending: false,
  stats: {
    users: [
      {
        id: "user-2",
        name: "Ada",
        email: "ada@example.com",
        tripCount: 7,
        totalCo2: 15.2,
        createdAt: "2026-04-08T10:00:00.000Z",
        isAdmin: false,
        super73Enabled: false,
      },
    ],
    recentTrips: [
      {
        id: "trip-1",
        userId: "user-2",
        userName: "Ada",
        distanceKm: 12.3,
        durationSec: 1800,
        co2SavedKg: 2.5,
        startedAt: "2026-04-08T10:00:00.000Z",
      },
    ],
    dailyTripCounts: [{ date: "2026-04-08", count: 4 }],
  },
  tripDetail: null,
  tripPending: false,
}));

vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("lucide-react", () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    Shield: Icon,
    Users: Icon,
    MapPin: Icon,
    Calendar: Icon,
    CalendarDays: Icon,
    Database: Icon,
    Clock: Icon,
    Bike: Icon,
    Check: Icon,
    Rocket: Icon,
    X: Icon,
  };
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Bar: () => null,
}));

vi.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/admin/AdminStatCard", () => ({
  AdminStatCard: ({
    label,
    value,
    loading,
  }: {
    label: string;
    value?: number;
    loading?: boolean;
  }) => (
    <div>
      <span>{label}</span>
      <span>{loading ? "loading" : String(value ?? "")}</span>
    </div>
  ),
}));

vi.mock("@/components/admin/AuditLogSection", () => ({ AuditLogSection: () => <div>Audit</div> }));
vi.mock("@/components/admin/AnnouncementSection", () => ({
  AnnouncementSection: () => <div>Announcements</div>,
}));
vi.mock("@/components/admin/NotificationSection", () => ({
  NotificationSection: () => <div>Notifications</div>,
}));
vi.mock("@/components/TripMiniMap", () => ({ TripMiniMap: () => <div>MiniMap</div> }));

vi.mock("@/hooks/queries", () => ({
  useProfile: () => ({ data: state.profileData, isPending: state.profilePending }),
  useAdminHealth: () => ({ data: state.health, isPending: state.healthPending }),
  useAdminStats: () => ({ data: state.stats, isPending: state.statsPending }),
  useTrip: () => ({ data: state.tripDetail, isPending: state.tripPending }),
  useTriggerDeploy: () => ({ mutate: triggerDeployMutateMock, isPending: false }),
  useGrantAdmin: () => ({ mutate: grantAdminMutateMock, isPending: false }),
  useRevokeAdmin: () => ({ mutate: revokeAdminMutateMock, isPending: false }),
  useGrantSuper73Access: () => ({ mutate: grantSuper73AccessMutateMock, isPending: false }),
  useRevokeSuper73Access: () => ({ mutate: revokeSuper73AccessMutateMock, isPending: false }),
  useDeleteAdminUser: () => ({ mutate: deleteAdminUserMutateMock, isPending: false }),
}));

const renderAdmin = () =>
  render(
    <I18nProvider>
      <AdminPage />
    </I18nProvider>,
  );

describe("AdminPage coverage guards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    navigateMock.mockReset();
    triggerDeployMutateMock.mockReset();
    grantAdminMutateMock.mockReset();
    revokeAdminMutateMock.mockReset();
    grantSuper73AccessMutateMock.mockReset();
    revokeSuper73AccessMutateMock.mockReset();
    deleteAdminUserMutateMock.mockReset();
    state.profilePending = false;
    state.profileData = {
      user: {
        id: "admin-1",
        name: "Lyra Admin",
        email: "admin@example.com",
        isAdmin: true,
      },
    };
    state.healthPending = false;
    state.statsPending = false;
    state.health = {
      version: "2.48.0",
      uptime: 3661,
      userCount: 12,
      tripCount: 34,
      tripsToday: 5,
      tripsThisWeek: 11,
      dbConnected: true,
      dbSizeMb: 42.3,
    };
    state.stats = {
      users: [
        {
          id: "user-2",
          name: "Ada",
          email: "ada@example.com",
          tripCount: 7,
          totalCo2: 15.2,
          createdAt: "2026-04-08T10:00:00.000Z",
          isAdmin: false,
          super73Enabled: false,
        },
      ],
      recentTrips: [
        {
          id: "trip-1",
          userId: "user-2",
          userName: "Ada",
          distanceKm: 12.3,
          durationSec: 1800,
          co2SavedKg: 2.5,
          startedAt: "2026-04-08T10:00:00.000Z",
        },
      ],
      dailyTripCounts: [{ date: "2026-04-08", count: 4 }],
    };
    state.tripDetail = null;
    state.tripPending = false;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the loading state while the admin profile is pending", () => {
    state.profilePending = true;

    renderAdmin();

    expect(screen.getByRole("status", { name: "Chargement" })).toBeTruthy();
  });

  it("redirects non-admin users back home", () => {
    state.profileData = {
      user: {
        id: "user-2",
        name: "Ada",
        email: "ada@example.com",
        isAdmin: false,
      },
    };

    renderAdmin();

    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    expect(screen.queryByText("Système")).toBeNull();
  });

  it("renders admin metrics, handles deploy success, and updates a selected user after grant", () => {
    triggerDeployMutateMock.mockImplementation(
      (_arg: undefined, options?: { onSuccess?: () => void; onError?: () => void }) => {
        options?.onSuccess?.();
      },
    );
    grantAdminMutateMock.mockImplementation(
      (
        payload: { email: string },
        options?: {
          onSuccess?: (data: {
            user: {
              id: string;
              name: string;
              email: string;
              isAdmin: boolean;
              super73Enabled: boolean;
            };
          }) => void;
        },
      ) => {
        options?.onSuccess?.({
          user: {
            id: "user-2",
            name: "Ada",
            email: payload.email,
            isAdmin: true,
            super73Enabled: false,
          },
        });
      },
    );

    renderAdmin();

    expect(screen.getByText("2.48.0")).toBeTruthy();
    expect(screen.getAllByText("Utilisateurs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ada").length).toBeGreaterThan(0);
    expect(screen.getByText("Derniers trajets")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Déployer" }));
    expect(triggerDeployMutateMock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Déployé !" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("button", { name: "Déployer" })).toBeTruthy();

    fireEvent.click(screen.getAllByText("Ada")[0]);
    expect(screen.getByRole("dialog", { name: "Administration de Ada" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rendre admin" }));
    expect(grantAdminMutateMock).toHaveBeenCalledWith(
      { email: "ada@example.com" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByRole("button", { name: "Retirer admin" })).toBeTruthy();
  });
});
