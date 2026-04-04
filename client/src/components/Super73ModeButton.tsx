import { Bluetooth, BluetoothOff, Loader2 } from "lucide-react";
import { useSuper73, type BleStatus } from "@/hooks/useSuper73";
import type { Super73Mode } from "@/lib/super73-ble";

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

function ModeLabel({ mode }: { mode: Super73Mode }) {
  const isOffRoad = mode === "race";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        isOffRoad ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary-light"
      }`}
    >
      {MODE_LABELS[mode] ?? mode}
    </span>
  );
}

function StatusDot({ status }: { status: BleStatus }) {
  const color =
    status === "connected"
      ? "bg-primary"
      : status === "connecting"
        ? "bg-warning animate-pulse"
        : status === "error"
          ? "bg-danger"
          : "bg-text-muted";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export function Super73ModeButton({ enabled, compact = false }: Props) {
  const ble = useSuper73(enabled);

  if (!enabled || ble.status === "unsupported") return null;

  // Compact mode: small pill for TripPage header
  if (compact) {
    if (ble.status === "disconnected") {
      return (
        <button
          onClick={ble.connect}
          className="flex items-center gap-1 rounded-full bg-surface-container px-2 py-1 active:scale-95"
        >
          <Bluetooth size={12} className="text-text-muted" />
          <span className="text-[10px] font-bold text-text-muted">S73</span>
        </button>
      );
    }

    if (ble.status === "connecting") {
      return (
        <div className="flex items-center gap-1 rounded-full bg-surface-container px-2 py-1">
          <Loader2 size={12} className="animate-spin text-warning" />
          <span className="text-[10px] font-bold text-text-muted">S73</span>
        </div>
      );
    }

    if (ble.status === "error") {
      return (
        <button
          onClick={ble.connect}
          className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 active:scale-95"
        >
          <BluetoothOff size={12} className="text-danger" />
          <span className="text-[10px] font-bold text-danger">Erreur</span>
        </button>
      );
    }

    // Connected — show mode toggle
    return (
      <button
        onClick={ble.toggleMode}
        className="flex items-center gap-1.5 rounded-full bg-surface-container px-2 py-1 active:scale-95"
      >
        <StatusDot status={ble.status} />
        {ble.bikeState && <ModeLabel mode={ble.bikeState.mode} />}
      </button>
    );
  }

  // Full mode: larger controls for VehiclePage
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={ble.status} />
          <span className="text-sm font-medium text-text">
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
            className="rounded-lg bg-surface-container px-3 py-1.5 text-xs font-bold text-text-muted active:scale-95"
          >
            Déconnecter
          </button>
        ) : (
          <button
            onClick={ble.connect}
            disabled={ble.status === "connecting"}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-bg active:scale-95 disabled:opacity-50"
          >
            {ble.status === "connecting" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              "Connecter"
            )}
          </button>
        )}
      </div>

      {ble.error && <p className="text-xs text-danger">{ble.error}</p>}

      {ble.status === "connected" && ble.bikeState && (
        <div className="grid grid-cols-2 gap-2">
          {(["eco", "tour", "sport", "race"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => ble.setMode(mode)}
              className={`rounded-xl px-4 py-3 text-center text-sm font-bold uppercase tracking-wider transition-colors active:scale-95 ${
                ble.bikeState?.mode === mode
                  ? mode === "race"
                    ? "bg-warning text-bg"
                    : "bg-primary text-bg"
                  : "bg-surface-container text-text-muted"
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
