import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStoppedSession,
  getStoppedSession,
  hasStoppedSession,
  setStoppedSession,
} from "../stopped-session";

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

describe("stopped session persistence", () => {
  beforeEach(() => {
    localStore.clear();
    sessionStore.clear();
    Object.defineProperty(globalThis, "localStorage", {
      value: storageFactory(localStore),
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: storageFactory(sessionStore),
      configurable: true,
    });
  });

  it("persists stopped sessions in localStorage for transparent upgrades", () => {
    const stored = setStoppedSession({
      distanceKm: 4.2,
      durationSec: 900,
      gpsPoints: [],
      startedAt: "2026-04-09T10:00:00.000Z",
      endedAt: "2026-04-09T10:15:00.000Z",
    });

    expect(stored).toBe(true);
    expect(hasStoppedSession()).toBe(true);
    expect(getStoppedSession()).toEqual({
      distanceKm: 4.2,
      durationSec: 900,
      gpsPoints: [],
      startedAt: "2026-04-09T10:00:00.000Z",
      endedAt: "2026-04-09T10:15:00.000Z",
    });
  });

  it("migrates legacy stopped sessions from sessionStorage", () => {
    sessionStorage.setItem(
      "ecoride-stopped-session",
      JSON.stringify({
        distanceKm: 4.2,
        durationSec: 900,
        gpsPoints: [],
        startedAt: "2026-04-09T10:00:00.000Z",
        endedAt: "2026-04-09T10:15:00.000Z",
      }),
    );

    expect(getStoppedSession()).toEqual({
      distanceKm: 4.2,
      durationSec: 900,
      gpsPoints: [],
      startedAt: "2026-04-09T10:00:00.000Z",
      endedAt: "2026-04-09T10:15:00.000Z",
    });
    expect(localStorage.getItem("ecoride-stopped-session")).not.toBeNull();
  });

  it("clears both local and legacy stopped session storage", () => {
    localStorage.setItem("ecoride-stopped-session", "x");
    sessionStorage.setItem("ecoride-stopped-session", "y");

    clearStoppedSession();

    expect(localStorage.getItem("ecoride-stopped-session")).toBeNull();
    expect(sessionStorage.getItem("ecoride-stopped-session")).toBeNull();
  });
});
