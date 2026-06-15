import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import {
  useDashboardSummary,
  useChartTrips,
  useCommunityStats,
  useCommunityTimeline,
  useLeaderboard,
  useAchievements,
  useFuelPrice,
} from "../stats";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("stats queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useDashboardSummary", () => {
    it("fetches the summary with the default week period", async () => {
      const data = { totalDistanceKm: 10 };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useDashboardSummary(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/stats/summary?period=week");
      expect(result.current.data).toEqual(data);
    });

    it("uses the provided period", async () => {
      mockApiFetch.mockResolvedValue({ ok: true, data: {} });
      const { wrapper } = setup();

      const { result } = renderHook(() => useDashboardSummary("month"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/stats/summary?period=month");
    });
  });

  describe("useChartTrips", () => {
    it("fetches trips within the computed date range and unwraps trips", async () => {
      const trips = [{ id: "t1" }];
      mockApiFetch.mockResolvedValue({ ok: true, data: { trips } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useChartTrips("week"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(trips);
      const url = mockApiFetch.mock.calls[0]![0] as string;
      expect(url).toContain("/trips?from=");
      expect(url).toContain("&to=");
      expect(url).toContain("&limit=100");
    });

    it("computes a month range", async () => {
      mockApiFetch.mockResolvedValue({ ok: true, data: { trips: [] } });
      const { wrapper } = setup();
      const { result } = renderHook(() => useChartTrips("month"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalled();
    });

    it("computes a year range", async () => {
      mockApiFetch.mockResolvedValue({ ok: true, data: { trips: [] } });
      const { wrapper } = setup();
      const { result } = renderHook(() => useChartTrips("year"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalled();
    });
  });

  describe("useCommunityStats", () => {
    it("fetches community stats with default all period", async () => {
      const data = { totalCo2: 100 };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useCommunityStats(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/stats/community?period=all");
      expect(result.current.data).toEqual(data);
    });
  });

  describe("useCommunityTimeline", () => {
    it("fetches the timeline with default period+category", async () => {
      const data = { points: [] };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useCommunityTimeline(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/stats/community/timeline?period=all&category=co2",
      );
      expect(result.current.data).toEqual(data);
    });

    it("passes through period and category", async () => {
      mockApiFetch.mockResolvedValue({ ok: true, data: {} });
      const { wrapper } = setup();
      const { result } = renderHook(() => useCommunityTimeline("week", "trips"), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/stats/community/timeline?period=week&category=trips",
      );
    });
  });

  describe("useLeaderboard", () => {
    it("fetches the leaderboard and unwraps data", async () => {
      const data = { entries: [], userRank: null };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useLeaderboard("month", "speed"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/stats/leaderboard?period=month&category=speed");
      expect(result.current.data).toEqual(data);
    });
  });

  describe("useAchievements", () => {
    it("fetches achievements and unwraps data.achievements", async () => {
      const achievements = [{ id: "a1" }];
      mockApiFetch.mockResolvedValue({ ok: true, data: { achievements } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useAchievements(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/achievements");
      expect(result.current.data).toEqual(achievements);
    });
  });

  describe("useFuelPrice", () => {
    it("fetches the fuel price for the given type", async () => {
      const data = { priceEur: 1.8, fuelType: "diesel", updatedAt: "now" };
      mockApiFetch.mockResolvedValue({ ok: true, data });
      const { wrapper } = setup();

      const { result } = renderHook(() => useFuelPrice("diesel"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/fuel-price?type=diesel");
      expect(result.current.data).toEqual(data);
    });
  });
});
