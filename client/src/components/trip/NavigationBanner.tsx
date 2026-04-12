import {
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  RotateCcw,
  RotateCw,
  Navigation,
  Loader2,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/i18n/provider";

interface NavigationBannerProps {
  nextInstruction: string | null;
  distanceToNextStep: number | null; // metres
  isRecalculating: boolean;
  isArrived: boolean;
  /** ORS maneuver type: 0=left 1=right 2=sharpLeft 3=sharpRight 4=slightLeft 5=slightRight
   *  6=straight 7=roundabout 8=exitRoundabout 9=uTurn 10=goal 11=depart 12=keepLeft 13=keepRight */
  maneuverType: number | null;
}

function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

// Map ORS maneuver type → Lucide icon
const MANEUVER_ICONS: Record<number, LucideIcon> = {
  0: ArrowLeft, // Left
  1: ArrowRight, // Right
  2: ArrowUpLeft, // SharpLeft
  3: ArrowUpRight, // SharpRight
  4: ArrowUpLeft, // SlightLeft
  5: ArrowUpRight, // SlightRight
  6: ArrowUp, // Straight
  7: RotateCw, // EnterRoundabout
  8: ArrowRight, // ExitRoundabout
  9: RotateCcw, // UTurn
  10: Navigation, // Goal
  11: Navigation, // Depart
  12: ArrowUpLeft, // KeepLeft
  13: ArrowUpRight, // KeepRight
};

export function NavigationBanner({
  nextInstruction,
  distanceToNextStep,
  isRecalculating,
  isArrived,
  maneuverType,
}: NavigationBannerProps) {
  const t = useT();

  if (!nextInstruction && !isRecalculating && !isArrived) return null;

  const ManeuverIcon =
    maneuverType != null ? (MANEUVER_ICONS[maneuverType] ?? Navigation) : Navigation;

  return (
    <div
      className="flex items-center gap-3 bg-primary/10 px-4 py-3"
      data-testid="navigation-banner"
    >
      {isArrived ? (
        <>
          <CheckCircle size={20} className="shrink-0 text-primary" />
          <span className="text-sm font-semibold text-primary">{t("trip.navigation.arrived")}</span>
        </>
      ) : isRecalculating ? (
        <>
          <Loader2 size={20} className="shrink-0 animate-spin text-primary" />
          <span className="text-sm font-medium text-text-muted">
            {t("trip.navigation.recalculating")}
          </span>
        </>
      ) : (
        <>
          <ManeuverIcon size={20} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{nextInstruction}</p>
            {distanceToNextStep != null && (
              <p className="text-xs text-text-muted">{formatDistance(distanceToNextStep)}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
