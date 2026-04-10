import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router";
import {
  User as UserIcon,
  Bike,
  Bell,
  BellOff,
  ChevronRight,
  ChevronDown,
  LogOut,
  Loader2,
  Check,
  Droplets,
  Download,
  Upload,
  Trash2,
  Shield,
  MessageSquarePlus,
  Bluetooth,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BADGES, FUEL_TYPES } from "@ecoride/shared/types";
import type { FuelType, BadgeId } from "@ecoride/shared/types";
import {
  useProfile,
  useAchievements,
  useTripPresets,
  useUpdateProfile,
  useFuelPrice,
  useDeleteAccount,
  useDeleteTripPreset,
  useExportData,
  useImportData,
  useSubmitFeedback,
} from "@/hooks/queries";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { signOut } from "@/lib/auth";
import { formatFullDate } from "@/lib/format-utils";
import { isBleSupported, scanAndConnect } from "@/lib/super73-ble";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useT } from "@/i18n/provider";

const allBadgeIds = Object.keys(BADGES) as BadgeId[];

export function ProfilePage() {
  const t = useT();
  const navigate = useNavigate();
  const { data: profileData, isPending: profileLoading } = useProfile();
  const { data: achievements, isPending: achievementsLoading } = useAchievements();
  const { data: tripPresetsData } = useTripPresets();
  const updateProfile = useUpdateProfile();

  const push = usePushNotifications();
  const deleteAccount = useDeleteAccount();
  const deleteTripPreset = useDeleteTripPreset();
  const exportData = useExportData();
  const importData = useImportData();
  const submitFeedback = useSubmitFeedback();
  const importFileRef = useRef<HTMLInputElement>(null);

  const userFuelType = profileData?.user?.fuelType ?? "sp95";
  const { data: fuelPrice, isPending: fuelPriceLoading } = useFuelPrice(userFuelType);

  const [showVehicle, setShowVehicle] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [vehicleModel, setVehicleModel] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("sp95");
  const [consumption, setConsumption] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("bug");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackDesc, setFeedbackDesc] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const user = profileData?.user;
  const stats = profileData?.stats;

  const tripPresets = tripPresetsData ?? [];
  // Sync form state when profile loads
  useEffect(() => {
    if (user) {
      setVehicleModel(user.vehicleModel ?? "");
      setFuelType(user.fuelType ?? "sp95");
      setConsumption(String(user.consumptionL100 ?? ""));
    }
  }, [user]);

  if (profileLoading || achievementsLoading || !user || !stats) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label={t("profile.loadingAria")}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const handleSaveVehicle = () => {
    updateProfile.mutate(
      {
        vehicleModel: vehicleModel || undefined,
        fuelType,
        consumptionL100: consumption ? Number(consumption) : undefined,
      },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => {
            setSaveSuccess(false);
            setShowVehicle(false);
          }, 500);
        },
      },
    );
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(t("profile.delete.confirm"));
    if (!confirmed) return;
    deleteAccount.mutate(undefined, {
      onSuccess: () => navigate("/login"),
    });
  };

  const handleExportData = () => {
    exportData.mutate();
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const confirmed = window.confirm(t("profile.import.confirm"));
    if (!confirmed) return;
    importData.mutate(file, {
      onSuccess: (data) => {
        window.alert(
          t("profile.import.success", { imported: data.imported, skipped: data.skipped }),
        );
      },
      onError: (err) => {
        window.alert(
          t("profile.import.error", {
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      },
    });
  };

  const handleDeleteTripPreset = (tripPresetId: string, label: string) => {
    const confirmed = window.confirm(t("profile.presets.confirmDelete", { label }));
    if (!confirmed) return;
    deleteTripPreset.mutate(tripPresetId);
  };

  return (
    <>
      <PageHeader title={t("profile.header.title")} />

      <div className="space-y-8 px-6 pb-6">
        {/* User Identity Hero */}
        <section className="flex flex-col items-center space-y-4 text-center">
          <div className="relative">
            <div className="rounded-full bg-gradient-to-tr from-primary to-primary-dark p-1">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface">
                {user.image ? (
                  <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-primary-light">
                    {user.name.charAt(0)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-text">{user.name}</h2>
            <div className="mt-1 inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-light">
              {t("profile.ecoRiderBadge")}
            </div>
          </div>
        </section>

        {/* Stats Bento Grid */}
        <section className="grid grid-cols-2 gap-4">
          <div className="group relative col-span-2 overflow-hidden rounded-lg bg-surface-low p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-primary/70">
              {t("profile.stats.totalCo2")}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tracking-tighter text-text">
                {stats.totalCo2SavedKg.toFixed(1)}
              </span>
              <span className="text-xl font-bold uppercase text-text-dim">
                {t("profile.stats.kgUnit")}
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {t("profile.stats.distance")}
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                {Math.round(stats.totalDistanceKm)}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
                {t("profile.stats.kmUnit")}
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {t("profile.stats.trips")}
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">{stats.tripCount}</span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {t("profile.stats.fuel")}
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                {stats.totalFuelSavedL.toFixed(1)}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
                {t("profile.stats.litersUnit")}
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {t("profile.stats.saved")}
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                {stats.totalMoneySavedEur.toFixed(2)}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
                {t("profile.stats.eurUnit")}
              </span>
            </div>
          </div>
        </section>

        {/* Fuel Price */}
        <div className="flex items-center gap-4 rounded-lg bg-surface-low px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Droplets size={20} className="text-primary-light" />
          </div>
          {fuelPriceLoading ? (
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-surface-high" />
              <div className="h-3 w-32 animate-pulse rounded bg-surface-high" />
            </div>
          ) : fuelPrice ? (
            <div className="flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-text">
                  {fuelPrice.priceEur.toFixed(2)} &euro;/L
                </span>
                <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
                  {fuelPrice.fuelType.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                {fuelPrice.stationName ? fuelPrice.stationName : t("profile.fuel.nationalAverage")}
              </p>
            </div>
          ) : null}
        </div>

        {/* Badges */}
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold tracking-tight">{t("profile.badges.title")}</h2>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {allBadgeIds.map((id) => {
              const badge = BADGES[id];
              const unlocked = (achievements ?? []).some((a) => a.badgeId === id);
              return (
                <div
                  key={id}
                  className={`flex flex-col items-center gap-2 ${!unlocked ? "opacity-40" : ""}`}
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                      unlocked
                        ? "bg-primary/10 text-primary-light"
                        : "bg-surface-high text-text-dim"
                    }`}
                  >
                    <span className="text-2xl">{badge.icon}</span>
                  </div>
                  <span className="text-center text-xs font-bold uppercase leading-tight text-text-muted">
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">{t("profile.presets.title")}</h2>
              <p className="mt-1 text-sm text-text-muted">{t("profile.presets.subtitle")}</p>
            </div>
          </div>
          <div className="space-y-3">
            {tripPresets.length === 0 ? (
              <div className="rounded-lg bg-surface-low p-5 text-sm text-text-muted">
                {t("profile.presets.empty")}
              </div>
            ) : (
              tripPresets.map((tripPreset) => (
                <div
                  key={tripPreset.id}
                  className="flex items-center justify-between gap-4 rounded-lg bg-surface-low p-5"
                >
                  <div>
                    <p className="text-sm font-bold text-text">{tripPreset.label}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {tripPreset.distanceKm.toFixed(1)} {t("profile.stats.kmUnit")}
                      {tripPreset.durationSec != null
                        ? ` · ${Math.round(tripPreset.durationSec / 60)} min`
                        : ` · ${t("profile.presets.customDuration")}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteTripPreset(tripPreset.id, tripPreset.label)}
                    disabled={deleteTripPreset.isPending}
                    className="rounded-lg bg-danger/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-danger active:scale-95 disabled:opacity-50"
                  >
                    {t("profile.presets.delete")}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Vehicle Form (collapsible) */}
        {showVehicle && (
          <section className="space-y-4 rounded-xl bg-surface-low p-6">
            <h2 className="text-lg font-bold tracking-tight">{t("profile.vehicle.title")}</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                  {t("profile.vehicle.model")}
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                  {t("profile.vehicle.fuel")}
                </label>
                <select
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value as FuelType)}
                  className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {FUEL_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                  {t("profile.vehicle.consumption")}
                </label>
                <input
                  type="number"
                  value={consumption}
                  onChange={(e) => setConsumption(e.target.value)}
                  className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <button
              onClick={handleSaveVehicle}
              disabled={updateProfile.isPending || saveSuccess}
              className={`w-full rounded-xl py-3 text-sm font-black uppercase tracking-widest active:scale-95 disabled:opacity-50 ${
                saveSuccess ? "bg-green-600 text-white" : "bg-primary text-bg"
              }`}
            >
              {saveSuccess ? (
                <span className="flex items-center justify-center gap-2">
                  <Check size={16} /> {t("profile.vehicle.saved")}
                </span>
              ) : updateProfile.isPending ? (
                t("profile.vehicle.saving")
              ) : (
                t("profile.vehicle.save")
              )}
            </button>
          </section>
        )}

        {/* Settings List */}
        <section className="space-y-2">
          <h2 className="mb-4 text-lg font-bold tracking-tight">{t("profile.settings.title")}</h2>
          <div className="overflow-hidden rounded-lg bg-surface-low">
            {/* Informations personnelles */}
            <button
              onClick={() => setShowPersonalInfo(!showPersonalInfo)}
              className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
            >
              <div className="flex items-center gap-4">
                <UserIcon size={20} className="text-text-muted" />
                <span className="text-sm font-medium">{t("profile.settings.personalInfo")}</span>
              </div>
              {showPersonalInfo ? (
                <ChevronDown size={18} className="text-text-dim" />
              ) : (
                <ChevronRight size={18} className="text-text-dim" />
              )}
            </button>
            {showPersonalInfo && (
              <div className="space-y-3 px-4 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                    {t("profile.settings.name")}
                  </label>
                  <div className="w-full rounded-lg bg-surface-high p-3 text-sm text-text-dim">
                    {user.name}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                    {t("profile.settings.email")}
                  </label>
                  <div className="w-full rounded-lg bg-surface-high p-3 text-sm text-text-dim">
                    {user.email}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                    {t("profile.settings.memberSince")}
                  </label>
                  <div className="w-full rounded-lg bg-surface-high p-3 text-sm text-text-dim">
                    {formatFullDate(user.createdAt, user.timezone)}
                  </div>
                </div>
              </div>
            )}

            <div className="mx-4 h-px bg-white/5" />

            {/* Mon véhicule */}
            <button
              onClick={() => setShowVehicle(!showVehicle)}
              className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
            >
              <div className="flex items-center gap-4">
                <Bike size={20} className="text-text-muted" />
                <span className="text-sm font-medium">{t("profile.settings.myVehicle")}</span>
              </div>
              <ChevronRight size={18} className="text-text-dim" />
            </button>

            <div className="mx-4 h-px bg-white/5" />

            {/* Notifications — toggle */}
            <div className="flex w-full items-center justify-between p-4">
              <div className="flex items-center gap-4">
                {push.status === "subscribed" ? (
                  <Bell size={20} className="text-primary-light" />
                ) : (
                  <BellOff size={20} className="text-text-muted" />
                )}
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">{t("profile.settings.notifications")}</span>
                  {push.status === "unsupported" && (
                    <span className="text-xs text-text-dim">
                      {t("profile.settings.notificationsUnsupported")}
                    </span>
                  )}
                  {push.status === "denied" && (
                    <span className="text-xs text-text-dim">
                      {t("profile.settings.notificationsDenied")}
                    </span>
                  )}
                  {push.status === "subscribed" && (
                    <span className="text-xs text-primary/70">
                      {t("profile.settings.notificationsEnabled")}
                    </span>
                  )}
                </div>
              </div>
              {(push.status === "subscribed" || push.status === "unsubscribed") && (
                <button
                  onClick={push.toggle}
                  disabled={push.busy}
                  aria-label={
                    push.status === "subscribed"
                      ? t("profile.settings.notificationsDisableAria")
                      : t("profile.settings.notificationsEnableAria")
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${
                    push.status === "subscribed" ? "bg-primary" : "bg-surface-high"
                  }`}
                >
                  {push.busy ? (
                    <Loader2 size={14} className="mx-auto animate-spin text-text-dim" />
                  ) : (
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                        push.status === "subscribed" ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  )}
                </button>
              )}
            </div>

            <div className="mx-4 h-px bg-white/5" />

            {user?.super73Enabled && (
              <>
                {/* Super73 BLE — toggle + navigate to /vehicle */}
                <div className="flex w-full items-center justify-between p-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (user?.super73Enabled) navigate("/vehicle");
                    }}
                    disabled={!user?.super73Enabled}
                    className="flex min-w-0 items-center gap-4 text-left"
                  >
                    <Bluetooth
                      size={20}
                      className={user?.super73Enabled ? "text-primary-light" : "text-text-muted"}
                    />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">
                        {t("profile.settings.super73Connected")}
                      </span>
                      {!isBleSupported() && (
                        <span className="text-xs text-text-dim">
                          {t("profile.settings.super73Unsupported")}
                        </span>
                      )}
                      {user?.super73Enabled && (
                        <span className="text-xs text-primary/70">
                          {t("profile.settings.super73Enabled")}
                        </span>
                      )}
                    </div>
                    {user?.super73Enabled && (
                      <ChevronRight size={18} className="shrink-0 text-text-dim" />
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      if (user?.super73Enabled) {
                        // Disable — just toggle off
                        updateProfile.mutate({ super73Enabled: false });
                        return;
                      }
                      // Enable — launch pairing immediately
                      if (!isBleSupported()) return;
                      try {
                        await scanAndConnect(); // opens picker, user selects bike
                        updateProfile.mutate({ super73Enabled: true });
                        navigate("/vehicle");
                      } catch {
                        // User cancelled picker — don't enable
                      }
                    }}
                    disabled={updateProfile.isPending}
                    aria-label={
                      user?.super73Enabled
                        ? t("profile.settings.super73DisableAria")
                        : t("profile.settings.super73EnableAria")
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${
                      user?.super73Enabled ? "bg-primary" : "bg-surface-high"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                        user?.super73Enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Feedback form */}
          <div className="overflow-hidden rounded-lg bg-surface-low">
            <button
              onClick={() => {
                setShowFeedback(!showFeedback);
                setFeedbackSent(false);
              }}
              className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
            >
              <div className="flex items-center gap-4">
                <MessageSquarePlus size={20} className="text-text-muted" />
                <span className="text-sm font-medium">{t("profile.feedback.title")}</span>
              </div>
              {showFeedback ? (
                <ChevronDown size={18} className="text-text-dim" />
              ) : (
                <ChevronRight size={18} className="text-text-dim" />
              )}
            </button>
            {showFeedback && (
              <div className="space-y-3 px-4 pb-4">
                {feedbackSent ? (
                  <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-4">
                    <Check size={18} className="text-primary-light" />
                    <span className="text-sm font-medium text-primary-light">
                      {t("profile.feedback.thanks")}
                    </span>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitFeedback.mutate(
                        {
                          type: feedbackType,
                          title: feedbackTitle,
                          description: feedbackDesc,
                        },
                        {
                          onSuccess: () => {
                            setFeedbackSent(true);
                            setFeedbackTitle("");
                            setFeedbackDesc("");
                          },
                        },
                      );
                    }}
                    className="space-y-3"
                  >
                    <div className="flex gap-2">
                      {(["bug", "feature"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFeedbackType(type)}
                          className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                            feedbackType === type
                              ? "bg-primary/20 text-primary-light"
                              : "bg-surface-high text-text-muted"
                          }`}
                        >
                          {type === "bug"
                            ? t("profile.feedback.bug")
                            : t("profile.feedback.feature")}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={feedbackTitle}
                      onChange={(e) => setFeedbackTitle(e.target.value)}
                      placeholder={t("profile.feedback.titlePlaceholder")}
                      required
                      minLength={3}
                      maxLength={200}
                      className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <textarea
                      value={feedbackDesc}
                      onChange={(e) => setFeedbackDesc(e.target.value)}
                      placeholder={t("profile.feedback.descPlaceholder")}
                      required
                      minLength={10}
                      maxLength={2000}
                      rows={4}
                      className="w-full resize-none rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="submit"
                      disabled={submitFeedback.isPending}
                      className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
                    >
                      {submitFeedback.isPending
                        ? t("profile.feedback.sending")
                        : t("profile.feedback.send")}
                    </button>
                    {submitFeedback.isError && (
                      <p className="text-center text-xs text-danger">
                        {t("profile.feedback.error")}
                      </p>
                    )}
                  </form>
                )}
              </div>
            )}

            <div className="mx-4 h-px bg-white/5" />

            <LanguageSwitcher />
          </div>

          {/* Admin link (only visible for admins) */}
          {user.isAdmin && (
            <Link
              to="/admin"
              className="mt-4 flex w-full items-center justify-between rounded-lg bg-surface-high p-4 transition-colors hover:bg-surface-low"
            >
              <div className="flex items-center gap-4">
                <Shield size={20} className="text-primary-light" />
                <span className="text-sm font-medium">{t("profile.admin")}</span>
              </div>
              <ChevronRight size={18} className="text-text-dim" />
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="mt-6 w-full rounded-lg bg-surface-high py-4 text-xs font-bold uppercase tracking-widest text-danger active:scale-95"
          >
            <div className="flex items-center justify-center gap-2">
              <LogOut size={16} />
              {t("profile.logout")}
            </div>
          </button>

          <button
            onClick={handleExportData}
            disabled={exportData.isPending}
            className="mt-4 w-full rounded-lg bg-surface-high py-4 text-xs font-bold uppercase tracking-widest text-text-muted active:scale-95 disabled:opacity-50"
          >
            <div className="flex items-center justify-center gap-2">
              <Download size={16} />
              {exportData.isPending ? t("profile.export.exporting") : t("profile.export.label")}
            </div>
          </button>

          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            disabled={importData.isPending}
            className="mt-4 w-full rounded-lg bg-surface-high py-4 text-xs font-bold uppercase tracking-widest text-text-muted active:scale-95 disabled:opacity-50"
          >
            <div className="flex items-center justify-center gap-2">
              <Upload size={16} />
              {importData.isPending ? t("profile.import.importing") : t("profile.import.label")}
            </div>
          </button>

          <button
            onClick={handleDeleteAccount}
            disabled={deleteAccount.isPending}
            className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-500/10 py-4 text-xs font-bold uppercase tracking-widest text-red-400 active:scale-95 disabled:opacity-50"
          >
            <div className="flex items-center justify-center gap-2">
              <Trash2 size={16} />
              {deleteAccount.isPending ? t("profile.delete.deleting") : t("profile.delete.label")}
            </div>
          </button>
        </section>
      </div>
    </>
  );
}
