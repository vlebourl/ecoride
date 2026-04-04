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

export function Super73ModeButton({ enabled, compact = false }: Props) {
  const ble = useSuper73(enabled);

  if (!enabled || ble.status === "unsupported") return null;

  // ---- Compact mode: glove-friendly pill for TripPage header ----
  // Min touch target: 48×48 (iOS HIG) — we use h-12 (48px) with generous padding
  if (compact) {
    if (ble.status === "disconnected") {
      return (
        <button
          onClick={ble.connect}
          className="flex h-12 items-center gap-2 rounded-2xl bg-surface-container px-4 active:scale-95"
        >
          <Bluetooth size={18} className="text-text-muted" />
          <span className="text-sm font-bold text-text-muted">S73</span>
        </button>
      );
    }

    if (ble.status === "connecting") {
      return (
        <div className="flex h-12 items-center gap-2 rounded-2xl bg-surface-container px-4">
          <Loader2 size={18} className="animate-spin text-warning" />
          <span className="text-sm font-bold text-text-muted">S73</span>
        </div>
      );
    }

    if (ble.status === "error") {
      return (
        <button
          onClick={ble.connect}
          className="flex h-12 items-center gap-2 rounded-2xl bg-danger/10 px-4 active:scale-95"
        >
          <BluetoothOff size={18} className="text-danger" />
          <span className="text-sm font-bold text-danger">Erreur</span>
        </button>
      );
    }

    // Connected — large mode toggle pill
    const isOffRoad = ble.bikeState?.mode === "race";
    return (
      <button
        onClick={ble.toggleMode}
        className={`flex h-12 items-center gap-2.5 rounded-2xl px-5 active:scale-95 ${
          isOffRoad ? "bg-warning/20" : "bg-primary/20"
        }`}
      >
        <StatusDot status={ble.status} size="sm" />
        <span
          className={`text-sm font-bold uppercase tracking-wider ${
            isOffRoad ? "text-warning" : "text-primary-light"
          }`}
        >
          {ble.bikeState ? (MODE_LABELS[ble.bikeState.mode] ?? ble.bikeState.mode) : "..."}
        </span>
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
