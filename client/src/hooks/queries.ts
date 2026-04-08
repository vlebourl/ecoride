import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Trip, Achievement, TripPreset } from "@ecoride/shared/types";
import type {
  StatsSummaryResponse,
  LeaderboardEntry,
  CreateTripRequest,
  CreateTripPresetRequest,
  CreateTripPresetFromTripRequest,
  UpdateUserRequest,
  StatsPeriod,
  LeaderboardCategory,
  GrantAdminRequest,
  GrantAdminResponse,
  AdminUserAccessRequest,
  RevokeAdminResponse,
  GrantSuper73Response,
  RevokeSuper73Response,
  DeleteAdminUserResponse,
} from "@ecoride/shared/api-contracts";

// ---- Queries ----

export function useDashboardSummary(period: StatsPeriod = "week") {
  return useQuery({
    queryKey: ["stats", "summary", period],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: StatsSummaryResponse }>(`/stats/summary?period=${period}`).then(
        (r) => r.data,
      ),
  });
}

export function useTrip(tripId: string | null) {
  return useQuery({
    queryKey: ["trip", tripId],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { trip: Trip } }>(`/trips/${tripId}`).then((r) => r.data.trip),
    enabled: !!tripId,
  });
}

export function useTripPresets() {
  return useQuery({
    queryKey: ["trip-presets"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { tripPresets: TripPreset[] } }>("/trip-presets").then(
        (r) => r.data.tripPresets,
      ),
  });
}

export function useTrips(page = 1, limit = 50) {
  return useQuery({
    queryKey: ["trips", page, limit],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: { trips: Trip[] };
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/trips?page=${page}&limit=${limit}`).then((r) => ({
        trips: r.data.trips,
        pagination: r.pagination,
      })),
  });
}

export function useChartTrips(period: "week" | "month" | "year") {
  const now = new Date();
  let from: Date;

  if (period === "week") {
    from = new Date(now);
    from.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    from.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    from = new Date(now.getFullYear(), 0, 1);
  }

  const fromStr = from.toISOString();
  const toStr = now.toISOString();

  return useQuery({
    queryKey: ["trips", "chart", period, fromStr],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: { trips: Trip[] };
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(
        `/trips?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&limit=100`,
      ).then((r) => r.data.trips),
  });
}

export function useLeaderboard(period: StatsPeriod = "all", category: LeaderboardCategory = "co2") {
  return useQuery({
    queryKey: ["leaderboard", period, category],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: { entries: LeaderboardEntry[]; userRank: number | null };
      }>(`/stats/leaderboard?period=${period}&category=${category}`).then((r) => r.data),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: {
          user: import("@ecoride/shared/types").User;
          stats: {
            totalDistanceKm: number;
            totalCo2SavedKg: number;
            totalMoneySavedEur: number;
            totalFuelSavedL: number;
            tripCount: number;
          };
        };
      }>("/user/profile").then((r) => r.data),
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: ["achievements"],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: { achievements: Achievement[] };
      }>("/achievements").then((r) => r.data.achievements),
  });
}

export function useFuelPrice(fuelType: string) {
  return useQuery({
    queryKey: ["fuel-price", fuelType],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: {
          priceEur: number;
          fuelType: string;
          stationName?: string;
          updatedAt: string;
        };
      }>(`/fuel-price?type=${fuelType}`).then((r) => r.data),
    staleTime: 3_600_000, // 1 hour cache
  });
}

// ---- Admin queries ----

export interface AdminHealthData {
  version: string;
  uptime: number;
  userCount: number;
  tripCount: number;
  tripsToday: number;
  tripsThisWeek: number;
  dbConnected: boolean;
  dbSizeMb: number;
}

export interface AdminStatsUser {
  id: string;
  name: string;
  email: string;
  tripCount: number;
  totalCo2: number;
  createdAt: string;
  isAdmin: boolean;
  super73Enabled: boolean;
}

export interface AdminStatsTrip {
  id: string;
  userId: string;
  userName: string;
  distanceKm: number;
  durationSec: number;
  co2SavedKg: number;
  startedAt: string;
}

export interface AdminStatsData {
  users: AdminStatsUser[];
  recentTrips: AdminStatsTrip[];
  dailyTripCounts: { date: string; count: number }[];
}

export function useAdminHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: AdminHealthData }>("/admin/health").then((r) => r.data),
    refetchInterval: 30_000, // refresh every 30s
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: AdminStatsData }>("/admin/stats").then((r) => r.data),
  });
}

export function useGrantAdmin() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: GrantAdminRequest) =>
      apiFetch<{ ok: boolean; data: GrantAdminResponse }>("/admin/users/grant", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useRevokeAdmin() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminUserAccessRequest) =>
      apiFetch<{ ok: boolean; data: RevokeAdminResponse }>("/admin/users/revoke", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useGrantSuper73Access() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminUserAccessRequest) =>
      apiFetch<{ ok: boolean; data: GrantSuper73Response }>("/admin/users/super73/grant", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useRevokeSuper73Access() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminUserAccessRequest) =>
      apiFetch<{ ok: boolean; data: RevokeSuper73Response }>("/admin/users/super73/revoke", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminUserAccessRequest) =>
      apiFetch<{ ok: boolean; data: DeleteAdminUserResponse }>("/admin/users/delete", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
  });
}

export interface AdminNotificationLog {
  id: string;
  adminName: string;
  title: string;
  body: string;
  url: string | null;
  targetUserIds: string[] | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

export function useAdminNotifications() {
  return useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: { notifications: AdminNotificationLog[] };
      }>("/admin/notifications").then((r) => r.data.notifications),
  });
}

export function useSendAdminNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; body: string; url?: string; userIds?: string[] }) =>
      apiFetch<{
        ok: boolean;
        data: { sent: number; failed: number; notificationId: string };
      }>("/admin/notifications", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    },
  });
}

export interface AdminAuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  target: string | null;
  metadata: unknown;
  createdAt: string;
}

export function useAdminAuditLogs(filters?: { userId?: string; action?: string }) {
  const params = new URLSearchParams();
  if (filters?.userId) params.set("userId", filters.userId);
  if (filters?.action) params.set("action", filters.action);
  const qs = params.toString() ? `?${params.toString()}` : "";

  return useQuery({
    queryKey: ["admin", "audit-logs", filters?.userId ?? "", filters?.action ?? ""],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { auditLogs: AdminAuditLog[] } }>(
        `/admin/audit-logs${qs}`,
      ).then((r) => r.data.auditLogs),
  });
}

export function useTriggerDeploy() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; error?: string }>("/admin/deploy", { method: "POST" }),
  });
}

// ---- Announcements ----

export interface Announcement {
  id: string;
  title: string;
  body: string;
  url: string | null;
  active: boolean;
  createdAt: string;
}

export function useActiveAnnouncement() {
  return useQuery({
    queryKey: ["announcement", "active"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { announcement: Announcement | null } }>(
        "/announcements/active",
      ).then((r) => r.data.announcement),
    staleTime: 60_000,
  });
}

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { announcements: Announcement[] } }>(
        "/admin/announcements",
      ).then((r) => r.data.announcements),
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; body: string; url?: string }) =>
      apiFetch<{ ok: boolean; data: { announcement: Announcement } }>("/admin/announcements", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data.announcement),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "announcements"] });
      qc.invalidateQueries({ queryKey: ["announcement", "active"] });
    },
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/admin/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "announcements"] });
      qc.invalidateQueries({ queryKey: ["announcement", "active"] });
    },
  });
}

// ---- Mutations ----

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTripRequest) =>
      apiFetch<{ ok: boolean; data: { trip: Trip } }>("/trips", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data.trip),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["achievements"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useCreateTripPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTripPresetRequest) =>
      apiFetch<{ ok: boolean; data: { tripPreset: TripPreset } }>("/trip-presets", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data.tripPreset),
    onSuccess: (tripPreset) => {
      qc.setQueryData<TripPreset[]>(["trip-presets"], (current = []) => [tripPreset, ...current]);
      qc.invalidateQueries({ queryKey: ["trip-presets"] });
    },
  });
}

export function useCreateTripPresetFromTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, ...data }: CreateTripPresetFromTripRequest & { tripId: string }) =>
      apiFetch<{ ok: boolean; data: { tripPreset: TripPreset } }>(
        `/trip-presets/from-trip/${tripId}`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ).then((r) => r.data.tripPreset),
    onSuccess: (tripPreset) => {
      qc.setQueryData<TripPreset[]>(["trip-presets"], (current = []) => [tripPreset, ...current]);
      qc.invalidateQueries({ queryKey: ["trip-presets"] });
    },
  });
}

export function useDeleteTripPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripPresetId: string) =>
      apiFetch<{ ok: boolean }>(`/trip-presets/${tripPresetId}`, { method: "DELETE" }),
    onSuccess: (_result, tripPresetId) => {
      qc.setQueryData<TripPreset[]>(["trip-presets"], (current = []) =>
        current.filter((tripPreset) => tripPreset.id !== tripPresetId),
      );
      qc.invalidateQueries({ queryKey: ["trip-presets"] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) =>
      apiFetch<{ ok: boolean }>(`/trips/${tripId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserRequest) =>
      apiFetch<{ ok: boolean; data: { user: import("@ecoride/shared/types").User } }>(
        "/user/profile",
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      ).then((r) => r.data.user),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/user/profile", { method: "DELETE" }),
  });
}

export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const API_BASE = import.meta.env.VITE_API_URL || "/api";
      const res = await fetch(`${API_BASE}/user/export`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ecoride-data-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (data: { type: "bug" | "feature"; title: string; description: string }) =>
      apiFetch<{
        ok: boolean;
        data: { issueNumber: number | null; issueUrl: string | null };
      }>("/feedback", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.data),
  });
}
