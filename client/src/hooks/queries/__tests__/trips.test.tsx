import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import {
  useAllTrips,
  useTrip,
  useTripPresets,
  useTrips,
  useCreateTrip,
  useCreateTripPresetFromTrip,
  useDeleteTripPreset,
  useDeleteTrip,
} from "../trips";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
  const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper, invalidateQueriesSpy, setQueryDataSpy };
}

describe("trips queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useTrip", () => {
    it("fetches a trip and unwraps data.trip", async () => {
      const trip = { id: "t1" };
      mockApiFetch.mockResolvedValue({ ok: true, data: { trip } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useTrip("t1"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/trips/t1");
      expect(result.current.data).toEqual(trip);
    });

    it("does not fetch when tripId is null", () => {
      const { wrapper } = setup();
      renderHook(() => useTrip(null), { wrapper });
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe("useTripPresets", () => {
    it("fetches presets and unwraps data.tripPresets", async () => {
      const tripPresets = [{ id: "p1" }];
      mockApiFetch.mockResolvedValue({ ok: true, data: { tripPresets } });
      const { wrapper } = setup();

      const { result } = renderHook(() => useTripPresets(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/trip-presets");
      expect(result.current.data).toEqual(tripPresets);
    });
  });

  describe("useTrips", () => {
    it("fetches trips with pagination params and unwraps trips + pagination", async () => {
      const trips = [{ id: "t1" }];
      const pagination = { page: 2, limit: 10, total: 1, totalPages: 1 };
      mockApiFetch.mockResolvedValue({ ok: true, data: { trips }, pagination });
      const { wrapper } = setup();

      const { result } = renderHook(() => useTrips(2, 10), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/trips?page=2&limit=10");
      expect(result.current.data).toEqual({ trips, pagination });
    });

    it("defaults to page 1 limit 50", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        data: { trips: [] },
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      });
      const { wrapper } = setup();

      const { result } = renderHook(() => useTrips(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockApiFetch).toHaveBeenCalledWith("/trips?page=1&limit=50");
    });
  });

  describe("useAllTrips", () => {
    it("loads every trips page so stats recent activity exposes the full history", async () => {
      mockApiFetch
        .mockResolvedValueOnce({
          ok: true,
          data: { trips: [{ id: "trip-1" }] },
          pagination: { page: 1, limit: 100, total: 3, totalPages: 2 },
        })
        .mockResolvedValueOnce({
          ok: true,
          data: { trips: [{ id: "trip-2" }, { id: "trip-3" }] },
          pagination: { page: 2, limit: 100, total: 3, totalPages: 2 },
        });
      const { wrapper } = setup();

      const { result } = renderHook(() => useAllTrips(), { wrapper });

      await waitFor(() => {
        expect(result.current.data?.trips.map((trip) => trip.id)).toEqual([
          "trip-1",
          "trip-2",
          "trip-3",
        ]);
      });
      expect(mockApiFetch).toHaveBeenNthCalledWith(1, "/trips?page=1&limit=100");
      expect(mockApiFetch).toHaveBeenNthCalledWith(2, "/trips?page=2&limit=100");
    });
  });

  describe("useCreateTrip", () => {
    it("POSTs and invalidates trips/stats/achievements/profile", async () => {
      const trip = { id: "t1" };
      mockApiFetch.mockResolvedValue({ ok: true, data: { trip } });
      const { wrapper, invalidateQueriesSpy } = setup();

      const { result } = renderHook(() => useCreateTrip(), { wrapper });
      const created = await result.current.mutateAsync({ distanceKm: 5 } as never);

      expect(created).toEqual(trip);
      expect(mockApiFetch).toHaveBeenCalledWith("/trips", {
        method: "POST",
        body: JSON.stringify({ distanceKm: 5 }),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["trips"] });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["stats"] });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["achievements"] });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["profile"] });
    });
  });

  describe("useCreateTripPresetFromTrip", () => {
    it("POSTs to from-trip URL and prepends preset to cache", async () => {
      const tripPreset = { id: "np", label: "new" };
      mockApiFetch.mockResolvedValue({ ok: true, data: { tripPreset } });
      const { wrapper, queryClient, invalidateQueriesSpy } = setup();
      queryClient.setQueryData(["trip-presets"], [{ id: "existing" }]);

      const { result } = renderHook(() => useCreateTripPresetFromTrip(), { wrapper });
      await result.current.mutateAsync({ tripId: "t1", label: "new" } as never);

      expect(mockApiFetch).toHaveBeenCalledWith("/trip-presets/from-trip/t1", {
        method: "POST",
        body: JSON.stringify({ label: "new" }),
      });
      expect(queryClient.getQueryData(["trip-presets"])).toEqual([tripPreset, { id: "existing" }]);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["trip-presets"] });
    });
  });

  describe("useDeleteTripPreset", () => {
    it("DELETEs and removes the preset from cache", async () => {
      mockApiFetch.mockResolvedValue({ ok: true });
      const { wrapper, queryClient, invalidateQueriesSpy } = setup();
      queryClient.setQueryData(["trip-presets"], [{ id: "p1" }, { id: "p2" }]);

      const { result } = renderHook(() => useDeleteTripPreset(), { wrapper });
      await result.current.mutateAsync("p1");

      expect(mockApiFetch).toHaveBeenCalledWith("/trip-presets/p1", { method: "DELETE" });
      expect(queryClient.getQueryData(["trip-presets"])).toEqual([{ id: "p2" }]);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["trip-presets"] });
    });
  });

  describe("useDeleteTrip", () => {
    it("DELETEs and invalidates trips/stats/leaderboard/profile/achievements", async () => {
      mockApiFetch.mockResolvedValue({ ok: true });
      const { wrapper, invalidateQueriesSpy } = setup();

      const { result } = renderHook(() => useDeleteTrip(), { wrapper });
      await result.current.mutateAsync("t1");

      expect(mockApiFetch).toHaveBeenCalledWith("/trips/t1", { method: "DELETE" });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["trips"] });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["stats"] });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["leaderboard"] });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["profile"] });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["achievements"] });
    });
  });
});
