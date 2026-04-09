import { useState, useCallback } from "react";
import type { TripPreset } from "@ecoride/shared/types";

export interface UseManualTripResult {
  manualKm: string;
  setManualKm: (v: string) => void;
  manualMinutes: string;
  setManualMinutes: (v: string) => void;
  manualPresetId: string;
  setManualPresetId: (v: string) => void;
  applyManualPreset: (preset: Pick<TripPreset, "id" | "distanceKm" | "durationSec">) => void;
  handleManualPresetChange: (value: string) => void;
  resetManualForm: () => void;
}

/**
 * Manages manual trip entry state: km, minutes, preset selection.
 */
export function useManualTrip(tripPresets: TripPreset[]): UseManualTripResult {
  const [manualKm, setManualKm] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [manualPresetId, setManualPresetId] = useState<string>("custom");

  const applyManualPreset = useCallback(
    (preset: Pick<TripPreset, "id" | "distanceKm" | "durationSec">) => {
      setManualPresetId(preset.id);
      setManualKm(String(preset.distanceKm));
      setManualMinutes(
        preset.durationSec == null ? "" : String(Math.max(1, Math.round(preset.durationSec / 60))),
      );
    },
    [],
  );

  const handleManualPresetChange = useCallback(
    (value: string) => {
      if (value === "custom") {
        setManualPresetId("custom");
        setManualKm("");
        setManualMinutes("");
        return;
      }

      const tripPreset = tripPresets.find((preset) => preset.id === value);
      if (!tripPreset) return;
      applyManualPreset(tripPreset);
    },
    [tripPresets, applyManualPreset],
  );

  const resetManualForm = useCallback(() => {
    setManualPresetId("custom");
    setManualKm("");
    setManualMinutes("");
  }, []);

  return {
    manualKm,
    setManualKm,
    manualMinutes,
    setManualMinutes,
    manualPresetId,
    setManualPresetId,
    applyManualPreset,
    handleManualPresetChange,
    resetManualForm,
  };
}
