import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPendingTrips, queueTrip } from "../offline-queue";

const store = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
};

describe("offline trip queue", () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "99999999-9999-4999-9999-999999999999",
    );
  });

  it("preserves the idempotency key from a failed live save", () => {
    queueTrip({
      distanceKm: 3.2,
      durationSec: 720,
      startedAt: "2026-04-23T09:00:00.000Z",
      endedAt: "2026-04-23T09:12:00.000Z",
      gpsPoints: null,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(getPendingTrips()).toEqual([
      expect.objectContaining({
        distanceKm: 3.2,
        gpsPoints: null,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    ]);
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it("generates an idempotency key for legacy callers", () => {
    queueTrip({
      distanceKm: 4.2,
      durationSec: 900,
      startedAt: "2026-04-23T10:00:00.000Z",
      endedAt: "2026-04-23T10:15:00.000Z",
      gpsPoints: null,
    });

    expect(getPendingTrips()).toEqual([
      expect.objectContaining({
        distanceKm: 4.2,
        idempotencyKey: "99999999-9999-4999-9999-999999999999",
      }),
    ]);
  });
});
