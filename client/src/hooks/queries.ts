import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Trip, Achievement } from "@ecoride/shared/types";
import type {
  StatsSummaryResponse,
  LeaderboardEntry,
  CreateTripRequest,
  UpdateUserRequest,
  StatsPeriod,
  LeaderboardCategory,
} from "@ecoride/shared/api-contracts";

// ---- Queries ----

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useDashboardSummary(period: StatsPeriod = "week") {
  return useQuery({
    queryKey: ["stats", "summary", period],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: StatsSummaryResponse }>(
        `/stats/summary?period=${period}&tz=${encodeURIComponent(browserTz)}`,
      ).then((r) => r.data),
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

export function useWeeklyTrips() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const from = monday.toISOString();
  const to = now.toISOString();

  return useQuery({
    queryKey: ["trips", "weekly", from],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: { trips: Trip[] };
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`).then(
        (r) => r.data.trips,
      ),
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
