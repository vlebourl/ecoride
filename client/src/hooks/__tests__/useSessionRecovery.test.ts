import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSessionRecovery } from "../useSessionRecovery";
import type { TrackingBackup, TrackingSession, UseGpsTrackingResult } from "../useGpsTracking";

const stoppedSessionMock = vi.fn<() => TrackingSession | null>();
const trackingBackupMock = vi.fn<() => TrackingBackup | null>();
const trackingSessionMock = vi.fn<() => string | null>();
const clearTrackingBackupMock = vi.fn();

vi.mock("../useGpsTracking", () => ({
  getTrackingBackup: () => trackingBackupMock(),
  clearTrackingBackup: () => clearTrackingBackupMock(),
  getTrackingSession: () => trackingSessionMock(),
}));

vi.mock("@/lib/stopped-session", () => ({
  getStoppedSession: () => stoppedSessionMock(),
}));

describe("useSessionRecovery", () => {
  beforeEach(() => {
    stoppedSessionMock.mockReset();
    trackingBackupMock.mockReset();
    trackingSessionMock.mockReset();
    clearTrackingBackupMock.mockReset();
  });

  it("exposes a stopped session immediately on mount", () => {
    const stoppedSession: TrackingSession = {
      distanceKm: 12.3,
      durationSec: 900,
      gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: 1 }],
      startedAt: "2026-05-22T08:00:00.000Z",
      endedAt: "2026-05-22T08:15:00.000Z",
    };
    stoppedSessionMock.mockReturnValue(stoppedSession);
    trackingBackupMock.mockReturnValue(null);
    trackingSessionMock.mockReturnValue(null);

    const gps = {
      state: { isTracking: false },
      restore: vi.fn(),
    } as unknown as UseGpsTrackingResult;

    const { result } = renderHook(() => useSessionRecovery({ gps }));

    expect(result.current.initialUiState).toBe("stopped");
    expect(result.current.sessionRef.current).toEqual(stoppedSession);
    expect(gps.restore).not.toHaveBeenCalled();
  });

  it("silently restores a matching tracking backup", async () => {
    stoppedSessionMock.mockReturnValue(null);
    trackingSessionMock.mockReturnValue("2026-05-22T08:00:00.000Z");
    const backup: TrackingBackup = {
      gpsPoints: [{ lat: 48.8566, lng: 2.3522, ts: 1 }],
      distanceKm: 1.2,
      durationSec: 180,
      startedAt: "2026-05-22T08:00:00.000Z",
      distanceAnchor: null,
    };
    trackingBackupMock.mockReturnValue(backup);

    const restore = vi.fn();
    const gps = {
      state: { isTracking: false },
      restore,
    } as unknown as UseGpsTrackingResult;

    const { result } = renderHook(() => useSessionRecovery({ gps }));

    expect(result.current.initialUiState).toBe("tracking");
    await waitFor(() => expect(restore).toHaveBeenCalledWith(backup));
    expect(result.current.pendingBackup).toBeNull();
  });
});
