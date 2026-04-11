import { Navigation, Loader2, CheckCircle } from "lucide-react";
import { useT } from "@/i18n/provider";

interface NavigationBannerProps {
  nextInstruction: string | null;
  distanceToNextStep: number | null; // metres
  isRecalculating: boolean;
  isArrived: boolean;
}

function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

export function NavigationBanner({
  nextInstruction,
  distanceToNextStep,
  isRecalculating,
  isArrived,
}: NavigationBannerProps) {
  const t = useT();

  if (!nextInstruction && !isRecalculating && !isArrived) return null;

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
          <Navigation size={20} className="shrink-0 text-primary" />
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
