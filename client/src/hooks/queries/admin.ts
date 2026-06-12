import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminUserAccessRequest,
  DeleteAdminUserResponse,
  GrantAdminRequest,
  GrantAdminResponse,
  GrantSuper73Response,
  RevokeAdminResponse,
  RevokeSuper73Response,
} from "@ecoride/shared/api-contracts";
import { apiFetch } from "@/lib/api";

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

export interface AdminAuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  target: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  url: string | null;
  active: boolean;
  createdAt: string;
}

function invalidateAdminStats(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
}

export function useAdminHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: AdminHealthData }>("/admin/health").then(
        (response) => response.data,
      ),
    refetchInterval: 30_000,
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: AdminStatsData }>("/admin/stats").then(
        (response) => response.data,
      ),
  });
}

export function useGrantAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GrantAdminRequest) =>
      apiFetch<{ ok: boolean; data: GrantAdminResponse }>("/admin/users/grant", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data),
    onSuccess: () => {
      invalidateAdminStats(queryClient);
    },
  });
}

export function useRevokeAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminUserAccessRequest) =>
      apiFetch<{ ok: boolean; data: RevokeAdminResponse }>("/admin/users/revoke", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data),
    onSuccess: () => {
      invalidateAdminStats(queryClient);
    },
  });
}

export function useGrantSuper73Access() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminUserAccessRequest) =>
      apiFetch<{ ok: boolean; data: GrantSuper73Response }>("/admin/users/super73/grant", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data),
    onSuccess: () => {
      invalidateAdminStats(queryClient);
    },
  });
}

export function useRevokeSuper73Access() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminUserAccessRequest) =>
      apiFetch<{ ok: boolean; data: RevokeSuper73Response }>("/admin/users/super73/revoke", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data),
    onSuccess: () => {
      invalidateAdminStats(queryClient);
    },
  });
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AdminUserAccessRequest) =>
      apiFetch<{ ok: boolean; data: DeleteAdminUserResponse }>("/admin/users/delete", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data),
    onSuccess: () => {
      invalidateAdminStats(queryClient);
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
  });
}

export function useAdminNotifications() {
  return useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { notifications: AdminNotificationLog[] } }>(
        "/admin/notifications",
      ).then((response) => response.data.notifications),
  });
}

export function useSendAdminNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { title: string; body: string; url?: string; userIds?: string[] }) =>
      apiFetch<{
        ok: boolean;
        data: { sent: number; failed: number; notificationId: string };
      }>("/admin/notifications", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] });
    },
  });
}

export function useAdminAuditLogs(filters?: { userId?: string; action?: string }) {
  const params = new URLSearchParams();
  if (filters?.userId) params.set("userId", filters.userId);
  if (filters?.action) params.set("action", filters.action);
  const queryString = params.toString() ? `?${params.toString()}` : "";

  return useQuery({
    queryKey: ["admin", "audit-logs", filters?.userId ?? "", filters?.action ?? ""],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { auditLogs: AdminAuditLog[] } }>(
        `/admin/audit-logs${queryString}`,
      ).then((response) => response.data.auditLogs),
  });
}

export function useTriggerDeploy() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; error?: string }>("/admin/deploy", { method: "POST" }),
  });
}

export function useActiveAnnouncement() {
  return useQuery({
    queryKey: ["announcement", "active"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { announcement: Announcement | null } }>(
        "/announcements/active",
      ).then((response) => response.data.announcement),
    staleTime: 60_000,
  });
}

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { announcements: Announcement[] } }>(
        "/admin/announcements",
      ).then((response) => response.data.announcements),
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { title: string; body: string; url?: string }) =>
      apiFetch<{ ok: boolean; data: { announcement: Announcement } }>("/admin/announcements", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data.announcement),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcement", "active"] });
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/admin/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      queryClient.invalidateQueries({ queryKey: ["announcement", "active"] });
    },
  });
}
