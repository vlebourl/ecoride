import { BluetoothOff, Loader2 } from "lucide-react";
import { useSuper73, type BleStatus } from "@/hooks/useSuper73";

interface Props {
  enabled: boolean;
  compact?: boolean;
}

const MODE_LABELS: Record<string, string> = {
  eco: "EPAC",
  tour: "Tour",
  sport: "Sport",
  race: "Off-Road",
};

function StatusDot({ status, size = "md" }: { status: BleStatus; size?: "sm" | "md" }) {
  const color =
    status === "connected"
      ? "bg-primary"
      : status === "connecting"
        ? "bg-warning animate-pulse"
        : status === "error"
          ? "bg-danger"
          : "bg-text-muted";
  const px = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return <span className={`inline-block rounded-full ${px} ${color}`} />;
}

function CompactModeIcon({ offRoad }: { offRoad: boolean }) {
  if (offRoad) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M9 2 L16 15 H2 Z" fill="#60A5FA" />
      </svg>
    );
  }

  return <span className="h-4 w-4 rounded-full bg-warning" aria-hidden="true" />;
}

export function Super73ModeButton({ enabled, compact = false }: Props) {
  const ble = useSuper73();

  if (!enabled || ble.status === "unsupported") return null;

  // ---- Compact mode: fixed-size control for TripPage header ----
  // Min touch target: 48×48 (iOS HIG)
  if (compact) {
    const compactBaseClass =
      "flex aspect-square shrink-0 self-stretch items-center justify-center rounded-2xl border active:scale-95";

    if (ble.status === "disconnected") {
      return (
        <button
          onClick={ble.connect}
          className={`${compactBaseClass} border-surface-highest bg-surface-container`}
          aria-label="Super73 déconnecté"
        >
          <BluetoothOff size={18} className="text-text-muted" />
        </button>
      );
    }

    if (ble.status === "connecting") {
      return (
        <div
          className={`${compactBaseClass} border-surface-highest bg-surface-container`}
          aria-label="Connexion Super73 en cours"
        >
          <Loader2 size={18} className="animate-spin text-warning" />
        </div>
      );
    }

    if (ble.status === "error") {
      return (
        <button
          onClick={ble.connect}
          className={`${compactBaseClass} border-surface-highest bg-surface-container`}
          aria-label="Super73 déconnecté"
        >
          <BluetoothOff size={18} className="text-text-muted" />
        </button>
      );
    }

    const isOffRoad = ble.bikeState?.mode === "race";
    return (
      <button
        onClick={ble.toggleMode}
        className={`${compactBaseClass} ${
          isOffRoad ? "border-[#60A5FA]/40 bg-[#60A5FA]/10" : "border-warning/40 bg-warning/10"
        }`}
        aria-label={isOffRoad ? "Mode Off-Road" : "Mode EPAC"}
      >
        <CompactModeIcon offRoad={isOffRoad} />
      </button>
    );
  }

  // ---- Full mode: large controls for VehiclePage (glove-friendly) ----
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusDot status={ble.status} />
          <span className="text-base font-semibold text-text">
            {ble.status === "connected"
              ? "Connecté"
              : ble.status === "connecting"
                ? "Connexion..."
                : ble.status === "error"
                  ? "Erreur"
                  : "Déconnecté"}
          </span>
        </div>
        {ble.status === "connected" ? (
          <button
            onClick={ble.disconnect}
            className="h-12 rounded-xl bg-surface-high px-5 text-sm font-bold text-text-muted active:scale-95"
          >
            Déconnecter
          </button>
        ) : (
          <button
            onClick={ble.connect}
            disabled={ble.status === "connecting"}
            className="h-12 rounded-xl bg-primary px-6 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
          >
            {ble.status === "connecting" ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              "Connecter"
            )}
          </button>
        )}
      </div>

      {ble.error && <p className="text-sm text-danger">{ble.error}</p>}

      {ble.status === "connected" && ble.bikeState && (
        <div className="grid grid-cols-2 gap-3">
          {(["eco", "tour", "sport", "race"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => ble.setMode(mode)}
              className={`min-h-16 rounded-2xl px-4 py-4 text-center text-base font-bold uppercase tracking-wider transition-colors active:scale-95 ${
                ble.bikeState?.mode === mode
                  ? mode === "race"
                    ? "bg-warning text-bg"
                    : "bg-primary text-bg"
                  : "bg-surface-high text-text-muted"
              }`}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
