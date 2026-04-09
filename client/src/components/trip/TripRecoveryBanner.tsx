import { RotateCcw, X } from "lucide-react";
import type { TrackingBackup } from "@/hooks/useGpsTracking";

export interface TripRecoveryBannerProps {
  backup: TrackingBackup;
  formatTime: (s: number) => string;
  onRestore: () => void;
  onDismiss: () => void;
}

export function TripRecoveryBanner({
  backup,
  formatTime,
  onRestore,
  onDismiss,
}: TripRecoveryBannerProps) {
  return (
    <div className="z-50 flex items-center gap-3 bg-primary/20 px-6 py-3">
      <RotateCcw size={16} className="shrink-0 text-primary-light" />
      <div className="flex-1">
        <span className="text-sm font-medium text-primary-light">
          Un trajet en cours a été interrompu. {backup.distanceKm.toFixed(1)} km —{" "}
          {formatTime(backup.durationSec)}
        </span>
      </div>
      <button
        onClick={onRestore}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg"
      >
        Reprendre
      </button>
      <button
        onClick={onDismiss}
        className="rounded-lg p-1.5 text-primary-light hover:bg-primary/10"
        aria-label="Fermer"
      >
        <X size={14} />
      </button>
    </div>
  );
}
