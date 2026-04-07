import { useNavigate } from "react-router";
import { ChevronLeft, Sun, SunDim } from "lucide-react";
import { useProfile } from "@/hooks/queries";
import { useSuper73 } from "@/hooks/useSuper73";
import { isBleSupported } from "@/lib/super73-ble";
import { Super73ModeButton } from "@/components/Super73ModeButton";

const ASSIST_LEVELS = [0, 1, 2, 3, 4] as const;

export function VehiclePage() {
  const navigate = useNavigate();
  const { data: profileData, isLoading } = useProfile();
  const user = profileData?.user;
  const enabled = !!user?.super73Enabled;
  const ble = useSuper73();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!enabled) {
    navigate("/profile", { replace: true });
    return null;
  }

  const bleSupported = isBleSupported();

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/profile")}
        className="flex h-12 items-center gap-1.5 self-start rounded-xl px-3 text-sm font-medium text-text-muted active:scale-95"
      >
        <ChevronLeft size={20} />
        Profil
      </button>

      <h1 className="text-2xl font-black tracking-tight">
        <span className="text-text">Mon </span>
        <span className="text-primary-light">Vélo</span>
      </h1>

      {!bleSupported && (
        <div className="rounded-xl bg-warning/10 px-4 py-3">
          <p className="text-sm font-medium text-warning">
            Bluetooth non supporté par ce navigateur.
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Sur iOS, utilisez Bluefy. Sur desktop, utilisez Chrome.
          </p>
        </div>
      )}

      {/* Connection + Mode selector */}
      <section className="rounded-2xl bg-surface-container p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
          Connexion & Mode
        </h2>
        <Super73ModeButton enabled={enabled} />
      </section>

      {/* Assist level */}
      {ble.status === "connected" && ble.bikeState && (
        <>
          <section className="rounded-2xl bg-surface-container p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
              Niveau d'assistance
            </h2>
            <div className="flex gap-2">
              {ASSIST_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => ble.setAssist(level)}
                  className={`flex-1 rounded-2xl py-5 text-center text-xl font-bold transition-colors active:scale-95 ${
                    ble.bikeState?.assist === level
                      ? "bg-primary text-bg"
                      : "bg-surface-high text-text-muted"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </section>

          {/* Lights */}
          <section className="rounded-2xl bg-surface-container p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
              Lumières
            </h2>
            <button
              onClick={() => ble.setLight(!ble.bikeState?.light)}
              className={`flex w-full items-center justify-between rounded-2xl px-6 py-5 transition-colors active:scale-[0.98] ${
                ble.bikeState?.light
                  ? "bg-primary/20 text-primary-light"
                  : "bg-surface-high text-text-muted"
              }`}
            >
              <span className="text-base font-bold">
                {ble.bikeState?.light ? "Allumées" : "Éteintes"}
              </span>
              {ble.bikeState?.light ? <Sun size={24} /> : <SunDim size={24} />}
            </button>
          </section>

          {/* Info */}
          <section className="rounded-2xl bg-surface-container p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
              Informations
            </h2>
            <div className="space-y-2 text-sm text-text-muted">
              <div className="flex justify-between">
                <span>Région</span>
                <span className="font-medium text-text">
                  {ble.bikeState?.region === "eu" ? "Europe (EPAC)" : "USA"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Mode actuel</span>
                <span className="font-medium text-text">
                  {ble.bikeState?.mode === "race" ? "Off-Road" : ble.bikeState?.mode}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Assistance</span>
                <span className="font-medium text-text">{ble.bikeState?.assist}/4</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
