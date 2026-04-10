import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Sun, SunDim, Check } from "lucide-react";
import { useProfile, useUpdateProfile } from "@/hooks/queries";
import { useSuper73 } from "@/hooks/useSuper73";
import { isBleSupported } from "@/lib/super73-ble";
import { Super73ModeButton } from "@/components/Super73ModeButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { useT } from "@/i18n/provider";
import type { Super73Mode } from "@ecoride/shared/types";

const ASSIST_LEVELS = [0, 1, 2, 3, 4] as const;
const SUPER73_DEFAULT_MODES: Super73Mode[] = ["eco", "tour", "sport", "race"];

export function VehiclePage() {
  const t = useT();
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
    <>
      <PageHeader
        title={t("vehicle.header.title")}
        back={{ to: "/profile", label: t("vehicle.header.back") }}
      />
      <div className="flex flex-col gap-6 px-6 pb-6">
        {!bleSupported && (
          <div className="rounded-xl bg-warning/10 px-4 py-3">
            <p className="text-sm font-medium text-warning">{t("vehicle.bleUnsupported.title")}</p>
            <p className="mt-1 text-xs text-text-muted">{t("vehicle.bleUnsupported.body")}</p>
          </div>
        )}

        {/* Connection + Mode selector */}
        <section className="rounded-2xl bg-surface-container p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
            {t("vehicle.connection.title")}
          </h2>
          <Super73ModeButton enabled={enabled} />
        </section>

        <section className="rounded-2xl bg-surface-container p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                {t("vehicle.autoMode.title")}
              </h2>
              <p className="mt-1 text-xs text-text-dim">{t("vehicle.autoMode.subtitle")}</p>
            </div>
            {saveSuccess && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-xs font-bold text-primary-light">
                <Check size={12} />
                {t("vehicle.autoMode.savedBadge")}
              </span>
            )}
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-high px-4 py-3">
              <div>
                <span className="block text-sm font-semibold text-text">
                  {t("vehicle.autoMode.toggleLabel")}
                </span>
                <span className="block text-xs text-text-dim">
                  {t("vehicle.autoMode.toggleHint")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAutoModeEnabled((current) => !current)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  autoModeEnabled ? "bg-primary" : "bg-surface"
                }`}
                aria-label={
                  autoModeEnabled
                    ? t("vehicle.autoMode.disableAria")
                    : t("vehicle.autoMode.enableAria")
                }
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
              {updateProfile.isPending ? t("vehicle.autoMode.saving") : t("vehicle.autoMode.save")}
            </button>
          </div>
        </section>

        {/* Default settings */}
        <section className="rounded-2xl bg-surface-container p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                {t("vehicle.defaults.title")}
              </h2>
              <p className="mt-1 text-xs text-text-dim">{t("vehicle.defaults.subtitle")}</p>
            </div>
            {defaultsSaved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-xs font-bold text-primary-light">
                <Check size={12} />
                {t("vehicle.autoMode.savedBadge")}
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-text-dim">
                  {t("vehicle.defaults.mode")}
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
                  {t("vehicle.defaults.assist")}
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
                <span className="block text-sm font-medium text-text">
                  {t("vehicle.defaults.lights")}
                </span>
                <span className="block text-xs text-text-dim">
                  {t("vehicle.defaults.lightsHint")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDefaultLight((current) => !current)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  defaultLight ? "bg-primary" : "bg-surface"
                }`}
                aria-label={
                  defaultLight
                    ? t("vehicle.defaults.lightsDisableAria")
                    : t("vehicle.defaults.lightsEnableAria")
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
                <p className="text-sm font-medium text-text">
                  {t("vehicle.defaults.thresholdsTitle")}
                </p>
                <p className="text-xs text-text-dim">{t("vehicle.defaults.thresholdsHint")}</p>
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
                {t("vehicle.defaults.thresholdsExplain")}
              </p>
            </div>

            {invalidThresholds && (
              <p className="text-xs text-danger">{t("vehicle.defaults.invalidThresholds")}</p>
            )}

            <button
              type="button"
              onClick={handleSaveDefaults}
              disabled={updateProfile.isPending || invalidThresholds}
              className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
            >
              {updateProfile.isPending ? t("vehicle.autoMode.saving") : t("vehicle.defaults.save")}
            </button>
          </div>
        </section>

        {/* Assist level */}
        {ble.status === "connected" && ble.bikeState && (
          <>
            <section className="rounded-2xl bg-surface-container p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
                {t("vehicle.assist.title")}
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
                {t("vehicle.lights.title")}
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
                  {ble.bikeState?.light ? t("vehicle.lights.on") : t("vehicle.lights.off")}
                </span>
                {ble.bikeState?.light ? <Sun size={24} /> : <SunDim size={24} />}
              </button>
            </section>

            {/* Info */}
            <section className="rounded-2xl bg-surface-container p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
                {t("vehicle.info.title")}
              </h2>
              <div className="space-y-2 text-sm text-text-muted">
                <div className="flex justify-between">
                  <span>{t("vehicle.info.region")}</span>
                  <span className="font-medium text-text">
                    {ble.bikeState?.region === "eu"
                      ? t("vehicle.info.regionEu")
                      : t("vehicle.info.regionUs")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("vehicle.info.currentMode")}</span>
                  <span className="font-medium text-text">
                    {ble.bikeState?.mode === "race" ? "Off-Road" : ble.bikeState?.mode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("vehicle.info.assist")}</span>
                  <span className="font-medium text-text">{ble.bikeState?.assist}/4</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
