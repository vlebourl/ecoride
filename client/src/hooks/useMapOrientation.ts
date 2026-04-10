import { useCallback, useState } from "react";

export type MapOrientation = "pov" | "north";

const STORAGE_KEY = "ecoride-map-orientation";

export function useMapOrientation(): {
  orientation: MapOrientation;
  toggle: () => void;
} {
  const [orientation, setOrientation] = useState<MapOrientation>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === "north" ? "north" : "pov";
    } catch {
      return "pov";
    }
  });

  const toggle = useCallback(() => {
    setOrientation((prev) => {
      const next = prev === "pov" ? "north" : "pov";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage full — ignore
      }
      return next;
    });
  }, []);

  return { orientation, toggle };
}
