import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useManualTrip } from "../useManualTrip";
import type { TripPreset } from "@ecoride/shared/types";

const presets: TripPreset[] = [
  {
    id: "p1",
    userId: "u1",
    label: "Aller bureau",
    distanceKm: 7.5,
    durationSec: 1500,
    gpsPoints: null,
    sourceTripId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

describe("useManualTrip", () => {
  it("starts with empty manualStartedAt", () => {
    const { result } = renderHook(() => useManualTrip(presets));
    expect(result.current.manualStartedAt).toBe("");
  });

  it("setManualStartedAt updates state", () => {
    const { result } = renderHook(() => useManualTrip(presets));
    act(() => result.current.setManualStartedAt("2026-05-04T08:30"));
    expect(result.current.manualStartedAt).toBe("2026-05-04T08:30");
  });

  it("resetManualForm clears manualStartedAt along with km/minutes/preset", () => {
    const { result } = renderHook(() => useManualTrip(presets));
    act(() => {
      result.current.setManualKm("12");
      result.current.setManualMinutes("45");
      result.current.setManualStartedAt("2026-05-04T08:30");
      result.current.setManualPresetId("p1");
    });
    act(() => result.current.resetManualForm());
    expect(result.current.manualKm).toBe("");
    expect(result.current.manualMinutes).toBe("");
    expect(result.current.manualStartedAt).toBe("");
    expect(result.current.manualPresetId).toBe("custom");
  });

  it("applying a preset does not touch manualStartedAt", () => {
    const { result } = renderHook(() => useManualTrip(presets));
    act(() => result.current.setManualStartedAt("2026-05-04T08:30"));
    act(() => result.current.handleManualPresetChange("p1"));
    expect(result.current.manualKm).toBe("7.5");
    expect(result.current.manualStartedAt).toBe("2026-05-04T08:30");
  });
});
