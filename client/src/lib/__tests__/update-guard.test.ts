import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPendingTripsMock = vi.fn();
const hasStoppedSessionMock = vi.fn();

vi.mock("@/lib/offline-queue", () => ({
  hasPendingTrips: () => hasPendingTripsMock(),
}));

vi.mock("@/lib/stopped-session", () => ({
  hasStoppedSession: () => hasStoppedSessionMock(),
}));

import { hasBlockingTripDataForUpdate } from "../update-guard";

const localStore = new Map<string, string>();
const sessionStore = new Map<string, string>();

const storageFactory = (store: Map<string, string>) => ({
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
});

describe("hasBlockingTripDataForUpdate", () => {
  beforeEach(() => {
    localStore.clear();
    sessionStore.clear();
    hasPendingTripsMock.mockReset();
    hasStoppedSessionMock.mockReset();
    hasPendingTripsMock.mockReturnValue(false);
    hasStoppedSessionMock.mockReturnValue(false);
    Object.defineProperty(globalThis, "localStorage", {
      value: storageFactory(localStore),
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: storageFactory(sessionStore),
      configurable: true,
    });
  });

  it("returns true for an active tracking session", () => {
    sessionStorage.setItem("ecoride-trip-session", "2026-04-09T10:00:00.000Z");
    expect(hasBlockingTripDataForUpdate()).toBe(true);
  });

  it("returns true for saved tracking backups, stopped sessions, or pending trips", () => {
    localStorage.setItem("ecoride-tracking-backup", "backup");
    expect(hasBlockingTripDataForUpdate()).toBe(true);

    localStore.clear();
    hasStoppedSessionMock.mockReturnValue(true);
    expect(hasBlockingTripDataForUpdate()).toBe(true);

    hasStoppedSessionMock.mockReturnValue(false);
    hasPendingTripsMock.mockReturnValue(true);
    expect(hasBlockingTripDataForUpdate()).toBe(true);
  });

  it("returns false when no trip data needs protection", () => {
    expect(hasBlockingTripDataForUpdate()).toBe(false);
  });
});
