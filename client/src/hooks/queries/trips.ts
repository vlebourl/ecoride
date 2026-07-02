import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTripRequest,
  CreateTripPresetFromTripRequest,
} from "@ecoride/shared/api-contracts";
import type { Trip, TripPreset } from "@ecoride/shared/types";
import { apiFetch } from "@/lib/api";

export function useTrip(tripId: string | null) {
  return useQuery({
    queryKey: ["trip", tripId],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { trip: Trip } }>(`/trips/${tripId}`).then(
        (response) => response.data.trip,
      ),
    enabled: !!tripId,
  });
}

export function useTripPresets() {
  return useQuery({
    queryKey: ["trip-presets"],
    queryFn: () =>
      apiFetch<{ ok: boolean; data: { tripPresets: TripPreset[] } }>("/trip-presets").then(
        (response) => response.data.tripPresets,
      ),
  });
}

const TRIPS_HISTORY_PAGE_SIZE = 100;

type TripsListResponse = {
  ok: boolean;
  data: { trips: Trip[] };
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

function fetchTripsPage(page: number, limit: number) {
  return apiFetch<TripsListResponse>(`/trips?page=${page}&limit=${limit}`).then((response) => ({
    trips: response.data.trips,
    pagination: response.pagination,
  }));
}

export function useTrips(page = 1, limit = 50) {
  return useQuery({
    queryKey: ["trips", page, limit],
    queryFn: () => fetchTripsPage(page, limit),
  });
}

export function useAllTrips() {
  return useQuery({
    queryKey: ["trips", "all"],
    queryFn: async () => {
      const firstPage = await fetchTripsPage(1, TRIPS_HISTORY_PAGE_SIZE);
      const allTrips = [...firstPage.trips];

      for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
        const nextPage = await fetchTripsPage(page, TRIPS_HISTORY_PAGE_SIZE);
        allTrips.push(...nextPage.trips);
      }

      return {
        trips: allTrips,
        pagination: {
          ...firstPage.pagination,
          limit: allTrips.length,
          page: 1,
        },
      };
    },
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTripRequest) =>
      apiFetch<{ ok: boolean; data: { trip: Trip } }>("/trips", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((response) => response.data.trip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useCreateTripPresetFromTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tripId, ...data }: CreateTripPresetFromTripRequest & { tripId: string }) =>
      apiFetch<{ ok: boolean; data: { tripPreset: TripPreset } }>(
        `/trip-presets/from-trip/${tripId}`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ).then((response) => response.data.tripPreset),
    onSuccess: (tripPreset) => {
      queryClient.setQueryData<TripPreset[]>(["trip-presets"], (current = []) => [
        tripPreset,
        ...current,
      ]);
      queryClient.invalidateQueries({ queryKey: ["trip-presets"] });
    },
  });
}

export function useDeleteTripPreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripPresetId: string) =>
      apiFetch<{ ok: boolean }>(`/trip-presets/${tripPresetId}`, { method: "DELETE" }),
    onSuccess: (_result, tripPresetId) => {
      queryClient.setQueryData<TripPreset[]>(["trip-presets"], (current = []) =>
        current.filter((tripPreset) => tripPreset.id !== tripPresetId),
      );
      queryClient.invalidateQueries({ queryKey: ["trip-presets"] });
    },
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tripId: string) =>
      apiFetch<{ ok: boolean }>(`/trips/${tripId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
    },
  });
}
