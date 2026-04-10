import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { useOfflineSync } from "../useOfflineSync";

const mockApiFetch = vi.fn();
const getPendingTripsMock = vi.fn();
const removePendingTripMock = vi.fn();
const recordRejectedTripMock = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

vi.mock("@/lib/offline-queue", () => ({
  QUEUE_CHANGED_EVENT: "ecoride:queue-changed",
  getPendingTrips: () => getPendingTripsMock(),
  removePendingTrip: (index: number) => removePendingTripMock(index),
  recordRejectedTrip: (trip: unknown, meta: unknown) => recordRejectedTripMock(trip, meta),
}));

describe("useOfflineSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderOfflineSync() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useOfflineSync(), { wrapper });
    return { invalidateQueriesSpy };
  }

  it("removes and records non-retryable 409 sync failures", async () => {
    const pendingTrip = {
      distanceKm: 3.2,
      durationSec: 600,
      startedAt: "2026-04-09T10:00:00.000Z",
      endedAt: "2026-04-09T10:10:00.000Z",
      gpsPoints: null,
      idempotencyKey: "11111111-1111-1111-1111-111111111111",
    };
    getPendingTripsMock.mockReturnValue([pendingTrip]);
    mockApiFetch.mockRejectedValue(new ApiError(409, "Ce trajet chevauche un trajet existant."));

    const { invalidateQueriesSpy } = renderOfflineSync();

    await waitFor(() => {
      expect(removePendingTripMock).toHaveBeenCalledWith(0);
    });

    expect(recordRejectedTripMock).toHaveBeenCalledWith(pendingTrip, {
      status: 409,
      reason: "Trajet rejeté : chevauchement avec un trajet déjà enregistré.",
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledTimes(4);
  });

  it("syncs trips that are queued after mount while the user stays online", async () => {
    // Regression test for GitHub #231: trips recorded while the app is already
    // open (e.g. a GPS trip that falls back to the offline queue because of a
    // transient failure) must be synced without requiring a full page reload
    // or an offline → online transition.
    const pendingTrip = {
      distanceKm: 4.2,
      durationSec: 900,
      startedAt: "2026-04-09T10:00:00.000Z",
      endedAt: "2026-04-09T10:15:00.000Z",
      gpsPoints: [
        { lat: 48.8566, lng: 2.3522, ts: 1744200000000 },
        { lat: 48.857, lng: 2.353, ts: 1744200010000 },
      ],
      idempotencyKey: "33333333-3333-3333-3333-333333333333",
    };

    // On mount the queue is empty — nothing should sync yet.
    getPendingTripsMock.mockReturnValue([]);
    mockApiFetch.mockResolvedValue({ ok: true, data: { trip: { id: "trip-1" } } });

    renderOfflineSync();

    // User is still online — no offline/online transition will happen. The
    // initial mount fires syncPending() once and finds an empty queue.
    await waitFor(() => {
      expect(getPendingTripsMock).toHaveBeenCalled();
    });
    expect(mockApiFetch).not.toHaveBeenCalled();

    // Now a trip gets enqueued (e.g. TripPage handleSaveTrip onError path).
    getPendingTripsMock.mockReturnValue([pendingTrip]);
    window.dispatchEvent(new Event("ecoride:queue-changed"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/trips",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(removePendingTripMock).toHaveBeenCalledWith(0);
  });

  it("keeps retryable sync failures in the pending queue", async () => {
    const pendingTrip = {
      distanceKm: 3.2,
      durationSec: 600,
      startedAt: "2026-04-09T10:00:00.000Z",
      endedAt: "2026-04-09T10:10:00.000Z",
      gpsPoints: null,
      idempotencyKey: "22222222-2222-2222-2222-222222222222",
    };
    getPendingTripsMock.mockReturnValue([pendingTrip]);
    mockApiFetch.mockRejectedValue(new Error("offline"));

    const { invalidateQueriesSpy } = renderOfflineSync();

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledOnce();
    });

    expect(removePendingTripMock).not.toHaveBeenCalled();
    expect(recordRejectedTripMock).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });
});
