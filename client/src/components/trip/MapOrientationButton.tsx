import { Compass, Navigation2 } from "lucide-react";
import type { MapOrientation } from "@/hooks/useMapOrientation";
import { useT } from "@/i18n/provider";

interface Props {
  orientation: MapOrientation;
  onToggle: () => void;
}

export function MapOrientationButton({ orientation, onToggle }: Props) {
  const t = useT();
  const isPov = orientation === "pov";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isPov ? t("trip.map.orientationNorth") : t("trip.map.orientationPov")}
      data-testid="map-orientation-toggle"
      data-orientation={orientation}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-surface-highest bg-surface-container/90 backdrop-blur active:scale-95"
    >
      {isPov ? (
        <Navigation2 size={20} className="text-primary" fill="currentColor" />
      ) : (
        <Compass size={20} className="text-text-muted" />
      )}
    </button>
  );
}
