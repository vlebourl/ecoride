import { useQuery } from "@tanstack/react-query";
import type {
  CommunityStatsResponse,
  CommunityTimelineResponse,
  LeaderboardCategory,
  LeaderboardEntry,
  StatsPeriod,
  StatsSummaryResponse,
} from "@ecoride/shared/api-contracts";
import type { Achievement, Trip } from "@ecoride/shared/types";
import { apiFetch } from "@/lib/api";

export function useDashboardSummary(period: StatsPeriod = "week") {
  return useQuery({
    queryKey: ["stats", "summary", period],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: StatsSummaryResponse }>(`/stats/summary?period=${period}`).then(
        (response) => response.data,
      ),
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
      ).then((response) => response.data.trips),
  });
}

export function useCommunityStats(period: StatsPeriod = "all") {
  return useQuery({
    queryKey: ["community-stats", period],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: CommunityStatsResponse }>(
        `/stats/community?period=${period}`,
      ).then((response) => response.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCommunityTimeline(
  period: StatsPeriod = "all",
  category: LeaderboardCategory = "co2",
) {
  return useQuery({
    queryKey: ["community-timeline", period, category],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: CommunityTimelineResponse }>(
        `/stats/community/timeline?period=${period}&category=${category}`,
      ).then((response) => response.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeaderboard(period: StatsPeriod = "all", category: LeaderboardCategory = "co2") {
  return useQuery({
    queryKey: ["leaderboard", period, category],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: { entries: LeaderboardEntry[]; userRank: number | null };
      }>(`/stats/leaderboard?period=${period}&category=${category}`).then(
        (response) => response.data,
      ),
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: ["achievements"],
    queryFn: () =>
      apiFetch<{
        ok: boolean;
        data: { achievements: Achievement[] };
      }>("/achievements").then((response) => response.data.achievements),
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
      }>(`/fuel-price?type=${fuelType}`).then((response) => response.data),
    staleTime: 3_600_000,
  });
}
