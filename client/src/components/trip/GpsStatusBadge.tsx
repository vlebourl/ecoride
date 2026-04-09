export interface GpsStatusBadgeProps {
  uiState: string;
  gpsAccuracy: number | null;
  idleAccuracy: number | null;
  isTracking: boolean;
  gpsStatus: "waiting" | "active" | "denied" | "unavailable";
}

export function GpsStatusBadge({
  uiState,
  gpsAccuracy,
  idleAccuracy,
  isTracking,
  gpsStatus,
}: GpsStatusBadgeProps) {
  const accuracy = uiState === "tracking" ? gpsAccuracy : idleAccuracy;
  const isActive = uiState === "tracking" ? isTracking : gpsStatus === "active";
  const isDenied = gpsStatus === "denied";
  const isUnavailable = gpsStatus === "unavailable";
  const isWaiting = gpsStatus === "waiting" && uiState !== "tracking";

  const color =
    isDenied || isUnavailable
      ? "#FF4D4D"
      : isWaiting
        ? "#9ca3af"
        : !isActive || accuracy == null
          ? "#9ca3af"
          : accuracy < 10
            ? "#2ecc71"
            : accuracy < 30
              ? "#FFB800"
              : "#FF4D4D";

  const label = isDenied
    ? "GPS refusé"
    : isUnavailable
      ? "GPS indisponible"
      : isWaiting
        ? "GPS..."
        : accuracy == null
          ? "GPS..."
          : accuracy < 10
            ? "Précis"
            : accuracy < 30
              ? "Moyen"
              : "Faible";

  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs font-bold text-text-muted">
        {label}
        {isActive && accuracy != null && ` · ${Math.round(accuracy)}m`}
      </span>
    </div>
  );
}
