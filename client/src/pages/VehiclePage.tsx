import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Sun, SunDim, Check } from "lucide-react";
import { useProfile, useUpdateProfile } from "@/hooks/queries";
import { useSuper73 } from "@/hooks/useSuper73";
import { isBleSupported } from "@/lib/super73-ble";
import { Super73ModeButton } from "@/components/Super73ModeButton";
import type { Super73Mode } from "@ecoride/shared/types";

const ASSIST_LEVELS = [0, 1, 2, 3, 4] as const;
const SUPER73_DEFAULT_MODES: Super73Mode[] = ["eco", "tour", "sport", "race"];

export function VehiclePage() {
  const navigate = useNavigate();
  const { data: profileData, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const user = profileData?.user;
  const enabled = !!user?.super73Enabled;
  const ble = useSuper73();
  const [autoModeEnabled, setAutoModeEnabled] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const [defaultMode, setDefaultMode] = useState<Super73Mode>("eco");
  const [defaultAssist, setDefaultAssist] = useState<(typeof ASSIST_LEVELS)[number]>(0);
  const [defaultLight, setDefaultLight] = useState(false);
  const [autoModeLowSpeed, setAutoModeLowSpeed] = useState("10");
  const [autoModeHighSpeed, setAutoModeHighSpeed] = useState("17");

  useEffect(() => {
    if (!user) return;
    setAutoModeEnabled(user.super73AutoModeEnabled ?? false);
    setDefaultMode(user.super73DefaultMode ?? "eco");
    setDefaultAssist((user.super73DefaultAssist ?? 0) as (typeof ASSIST_LEVELS)[number]);
    setDefaultLight(user.super73DefaultLight ?? false);
    setAutoModeLowSpeed(String(user.super73AutoModeLowSpeedKmh ?? 10));
    setAutoModeHighSpeed(String(user.super73AutoModeHighSpeedKmh ?? 17));
  }, [user]);

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

  const parsedLowSpeed = Number(autoModeLowSpeed);
  const parsedHighSpeed = Number(autoModeHighSpeed);
  const invalidThresholds =
    !Number.isFinite(parsedLowSpeed) ||
    !Number.isFinite(parsedHighSpeed) ||
    parsedLowSpeed <= 0 ||
    parsedHighSpeed <= 0 ||
    parsedLowSpeed >= parsedHighSpeed;

  const handleSaveAutoMode = () => {
    updateProfile.mutate(
      {
        super73AutoModeEnabled: autoModeEnabled,
      },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 1500);
        },
      },
    );
  };

  const handleSaveDefaults = () => {
    if (invalidThresholds) return;
    updateProfile.mutate(
      {
        super73DefaultMode: defaultMode,
        super73DefaultAssist: defaultAssist,
        super73DefaultLight: defaultLight,
        super73AutoModeLowSpeedKmh: parsedLowSpeed,
        super73AutoModeHighSpeedKmh: parsedHighSpeed,
      },
      {
        onSuccess: () => {
          setDefaultsSaved(true);
          setTimeout(() => setDefaultsSaved(false), 1500);
        },
      },
    );
  };

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

      <section className="rounded-2xl bg-surface-container p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Mode auto en trajet
            </h2>
            <p className="mt-1 text-xs text-text-dim">
              Passe en Off-Road à basse vitesse et en EPAC à vitesse plus élevée pendant un trajet.
            </p>
          </div>
          {saveSuccess && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-xs font-bold text-primary-light">
              <Check size={12} />
              Sauvé
            </span>
          )}
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-high px-4 py-3">
            <div>
              <span className="block text-sm font-semibold text-text">
                Mode auto selon la vitesse
              </span>
              <span className="block text-xs text-text-dim">
                Hystérésis actuelle: Off-Road à 10 km/h ou moins, EPAC à 17 km/h ou plus.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAutoModeEnabled((current) => !current)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                autoModeEnabled ? "bg-primary" : "bg-surface"
              }`}
              aria-label={autoModeEnabled ? "Désactiver le mode auto" : "Activer le mode auto"}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                  autoModeEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>

          <button
            type="button"
            onClick={handleSaveAutoMode}
            disabled={updateProfile.isPending}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
          >
            {updateProfile.isPending ? "Sauvegarde..." : "Enregistrer le mode auto"}
          </button>
        </div>
      </section>

      {/* Default settings */}
      <section className="rounded-2xl bg-surface-container p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Réglages par défaut
            </h2>
            <p className="mt-1 text-xs text-text-dim">Appliqués automatiquement à la connexion.</p>
          </div>
          {defaultsSaved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-xs font-bold text-primary-light">
              <Check size={12} />
              Sauvé
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-text-dim">
                Mode
              </span>
              <select
                value={defaultMode}
                onChange={(e) => setDefaultMode(e.target.value as Super73Mode)}
                className="w-full rounded-lg bg-surface-high px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {SUPER73_DEFAULT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "race" ? "Off-Road" : mode === "eco" ? "EPAC" : mode}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-text-dim">
                Assistance
              </span>
              <select
                value={defaultAssist}
                onChange={(e) =>
                  setDefaultAssist(Number(e.target.value) as (typeof ASSIST_LEVELS)[number])
                }
                className="w-full rounded-lg bg-surface-high px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {ASSIST_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg bg-surface-high px-3 py-2.5">
            <div className="min-w-0">
              <span className="block text-sm font-medium text-text">Lumières</span>
              <span className="block text-xs text-text-dim">Auto à la connexion</span>
            </div>
            <button
              type="button"
              onClick={() => setDefaultLight((current) => !current)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                defaultLight ? "bg-primary" : "bg-surface"
              }`}
              aria-label={
                defaultLight
                  ? "Désactiver les lumières par défaut"
                  : "Activer les lumières par défaut"
              }
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                  defaultLight ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>

          <div className="rounded-lg bg-surface-high p-3">
            <div>
              <p className="text-sm font-medium text-text">Seuils mode auto</p>
              <p className="text-xs text-text-dim">Bascule de mode selon la vitesse</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-text-dim">
                  Off-Road
                </span>
                <input
                  type="number"
                  min="1"
                  max="80"
                  step="0.5"
                  value={autoModeLowSpeed}
                  onChange={(e) => setAutoModeLowSpeed(e.target.value)}
                  className="w-full rounded-lg bg-surface px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-text-dim">
                  EPAC
                </span>
                <input
                  type="number"
                  min="1"
                  max="80"
                  step="0.5"
                  value={autoModeHighSpeed}
                  onChange={(e) => setAutoModeHighSpeed(e.target.value)}
                  className="w-full rounded-lg bg-surface px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-text-dim">
              Off-Road si vitesse ≤ seuil bas, EPAC si vitesse ≥ seuil haut.
            </p>
          </div>

          {invalidThresholds && (
            <p className="text-xs text-danger">
              Le seuil Off-Road doit être strictement inférieur au seuil EPAC.
            </p>
          )}

          <button
            type="button"
            onClick={handleSaveDefaults}
            disabled={updateProfile.isPending || invalidThresholds}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
          >
            {updateProfile.isPending ? "Sauvegarde..." : "Enregistrer les réglages"}
          </button>
        </div>
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
