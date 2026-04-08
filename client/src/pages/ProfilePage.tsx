import { useState, useEffect } from "react";
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
  Trash2,
  Shield,
  MessageSquarePlus,
  Bluetooth,
} from "lucide-react";
import { BADGES, FUEL_TYPES, type Super73Mode } from "@ecoride/shared/types";
import type { FuelType, BadgeId } from "@ecoride/shared/types";
import {
  useProfile,
  useAchievements,
  useUpdateProfile,
  useFuelPrice,
  useDeleteAccount,
  useExportData,
  useSubmitFeedback,
} from "@/hooks/queries";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { signOut } from "@/lib/auth";
import { isBleSupported, scanAndConnect } from "@/lib/super73-ble";

const SUPER73_DEFAULT_MODES: Super73Mode[] = ["eco", "tour", "sport", "race"];
const SUPER73_ASSIST_LEVELS = [0, 1, 2, 3, 4] as const;

const allBadgeIds = Object.keys(BADGES) as BadgeId[];

export function ProfilePage() {
  const navigate = useNavigate();
  const { data: profileData, isPending: profileLoading } = useProfile();
  const { data: achievements, isPending: achievementsLoading } = useAchievements();
  const updateProfile = useUpdateProfile();

  const push = usePushNotifications();
  const deleteAccount = useDeleteAccount();
  const exportData = useExportData();
  const submitFeedback = useSubmitFeedback();

  const userFuelType = profileData?.user?.fuelType ?? "sp95";
  const { data: fuelPrice, isPending: fuelPriceLoading } = useFuelPrice(userFuelType);

  const [showVehicle, setShowVehicle] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [vehicleModel, setVehicleModel] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("sp95");
  const [consumption, setConsumption] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [super73DefaultsSaved, setSuper73DefaultsSaved] = useState(false);
  const [super73DefaultMode, setSuper73DefaultMode] = useState<Super73Mode>("eco");
  const [super73DefaultAssist, setSuper73DefaultAssist] =
    useState<(typeof SUPER73_ASSIST_LEVELS)[number]>(0);
  const [super73DefaultLight, setSuper73DefaultLight] = useState(false);
  const [super73AutoModeLowSpeedKmh, setSuper73AutoModeLowSpeedKmh] = useState("10");
  const [super73AutoModeHighSpeedKmh, setSuper73AutoModeHighSpeedKmh] = useState("17");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"bug" | "feature">("bug");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackDesc, setFeedbackDesc] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const user = profileData?.user;
  const stats = profileData?.stats;

  // Sync form state when profile loads
  useEffect(() => {
    if (user) {
      setVehicleModel(user.vehicleModel ?? "");
      setFuelType(user.fuelType ?? "sp95");
      setConsumption(String(user.consumptionL100 ?? ""));
      setSuper73DefaultMode(user.super73DefaultMode ?? "eco");
      setSuper73DefaultAssist(
        (user.super73DefaultAssist ?? 0) as (typeof SUPER73_ASSIST_LEVELS)[number],
      );
      setSuper73DefaultLight(user.super73DefaultLight ?? false);
      setSuper73AutoModeLowSpeedKmh(String(user.super73AutoModeLowSpeedKmh ?? 10));
      setSuper73AutoModeHighSpeedKmh(String(user.super73AutoModeHighSpeedKmh ?? 17));
    }
  }, [user]);

  if (profileLoading || achievementsLoading || !user || !stats) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label="Chargement"
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

  const parsedLowSpeed = Number(super73AutoModeLowSpeedKmh);
  const parsedHighSpeed = Number(super73AutoModeHighSpeedKmh);
  const invalidSuper73Thresholds =
    !Number.isFinite(parsedLowSpeed) ||
    !Number.isFinite(parsedHighSpeed) ||
    parsedLowSpeed <= 0 ||
    parsedHighSpeed <= 0 ||
    parsedLowSpeed >= parsedHighSpeed;

  const handleSaveSuper73Defaults = () => {
    if (invalidSuper73Thresholds) return;
    updateProfile.mutate(
      {
        super73DefaultMode,
        super73DefaultAssist,
        super73DefaultLight,
        super73AutoModeLowSpeedKmh: parsedLowSpeed,
        super73AutoModeHighSpeedKmh: parsedHighSpeed,
      },
      {
        onSuccess: () => {
          setSuper73DefaultsSaved(true);
          setTimeout(() => setSuper73DefaultsSaved(false), 1500);
        },
      },
    );
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      "Êtes-vous sûr ? Toutes vos données seront supprimées définitivement.",
    );
    if (!confirmed) return;
    deleteAccount.mutate(undefined, {
      onSuccess: () => navigate("/login"),
    });
  };

  const handleExportData = () => {
    exportData.mutate();
  };

  return (
    <>
      {/* Header */}
      <header
        role="banner"
        className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl"
      >
        <span className="text-xl font-bold tracking-tighter">
          <span className="text-text">eco</span>
          <span className="text-primary-light">Ride</span>
        </span>
      </header>

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
            <h1 className="text-3xl font-bold tracking-tight text-text">{user.name}</h1>
            <div className="mt-1 inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-light">
              Eco Rider
            </div>
          </div>
        </section>

        {/* Stats Bento Grid */}
        <section className="grid grid-cols-2 gap-4">
          <div className="group relative col-span-2 overflow-hidden rounded-lg bg-surface-low p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-primary/70">
              Total CO₂ Économisé
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tracking-tighter text-text">
                {stats.totalCo2SavedKg.toFixed(1)}
              </span>
              <span className="text-xl font-bold uppercase text-text-dim">kg</span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">Distance</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                {Math.round(stats.totalDistanceKm)}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">km</span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">Trajets</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">{stats.tripCount}</span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">Carburant</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                {stats.totalFuelSavedL.toFixed(1)}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">L</span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-low p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">Economisé</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">
                {stats.totalMoneySavedEur.toFixed(2)}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-text-dim">EUR</span>
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
                {fuelPrice.stationName ? fuelPrice.stationName : "Prix moyen national"}
              </p>
            </div>
          ) : null}
        </div>

        {/* Badges */}
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold tracking-tight">Badges</h2>
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

        {/* Vehicle Form (collapsible) */}
        {showVehicle && (
          <section className="space-y-4 rounded-xl bg-surface-low p-6">
            <h2 className="text-lg font-bold tracking-tight">Véhicule de référence</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                  Modèle
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
                  Carburant
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
                  Consommation (L/100km)
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
                  <Check size={16} /> Enregistré
                </span>
              ) : updateProfile.isPending ? (
                "Enregistrement..."
              ) : (
                "Enregistrer"
              )}
            </button>
          </section>
        )}

        {/* Settings List */}
        <section className="space-y-2">
          <h2 className="mb-4 text-lg font-bold tracking-tight">Paramètres</h2>
          <div className="overflow-hidden rounded-lg bg-surface-low">
            {/* Informations personnelles */}
            <button
              onClick={() => setShowPersonalInfo(!showPersonalInfo)}
              className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
            >
              <div className="flex items-center gap-4">
                <UserIcon size={20} className="text-text-muted" />
                <span className="text-sm font-medium">Informations personnelles</span>
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
                    Nom
                  </label>
                  <div className="w-full rounded-lg bg-surface-high p-3 text-sm text-text-dim">
                    {user.name}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                    Email
                  </label>
                  <div className="w-full rounded-lg bg-surface-high p-3 text-sm text-text-dim">
                    {user.email}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
                    Membre depuis
                  </label>
                  <div className="w-full rounded-lg bg-surface-high p-3 text-sm text-text-dim">
                    {new Date(user.createdAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
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
                <span className="text-sm font-medium">Mon véhicule</span>
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
                  <span className="text-sm font-medium">Notifications</span>
                  {push.status === "unsupported" && (
                    <span className="text-xs text-text-dim">Non supporté par ce navigateur</span>
                  )}
                  {push.status === "denied" && (
                    <span className="text-xs text-text-dim">
                      Autorisation refusée dans les paramètres du navigateur
                    </span>
                  )}
                  {push.status === "subscribed" && (
                    <span className="text-xs text-primary/70">Activées</span>
                  )}
                </div>
              </div>
              {(push.status === "subscribed" || push.status === "unsubscribed") && (
                <button
                  onClick={push.toggle}
                  disabled={push.busy}
                  aria-label={
                    push.status === "subscribed"
                      ? "Désactiver les notifications"
                      : "Activer les notifications"
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

            {/* Super73 BLE — toggle + guided pairing */}
            <div className="flex w-full items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <Bluetooth
                  size={20}
                  className={user?.super73Enabled ? "text-primary-light" : "text-text-muted"}
                />
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">Vélo connecté (Super73)</span>
                  {!isBleSupported() && (
                    <span className="text-xs text-text-dim">Non supporté par ce navigateur</span>
                  )}
                  {user?.super73Enabled && <span className="text-xs text-primary/70">Activé</span>}
                </div>
              </div>
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
                  user?.super73Enabled ? "Désactiver le contrôle BLE" : "Activer le contrôle BLE"
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

            {user?.super73Enabled && (
              <>
                <div className="mx-4 h-px bg-white/5" />
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-medium">Réglages par défaut du vélo</span>
                      <p className="mt-1 text-xs text-text-dim">
                        Mode, assistance et lumières appliqués automatiquement à la connexion.
                      </p>
                    </div>
                    {super73DefaultsSaved && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-xs font-bold text-primary-light">
                        <Check size={12} />
                        Sauvé
                      </span>
                    )}
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-dim">
                      Mode par défaut
                    </span>
                    <select
                      value={super73DefaultMode}
                      onChange={(e) => setSuper73DefaultMode(e.target.value as Super73Mode)}
                      className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {SUPER73_DEFAULT_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode === "race" ? "Off-Road" : mode === "eco" ? "EPAC" : mode}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-dim">
                      Assistance par défaut
                    </span>
                    <select
                      value={super73DefaultAssist}
                      onChange={(e) =>
                        setSuper73DefaultAssist(
                          Number(e.target.value) as (typeof SUPER73_ASSIST_LEVELS)[number],
                        )
                      }
                      className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {SUPER73_ASSIST_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center justify-between gap-4 rounded-lg bg-surface-high p-3">
                    <div>
                      <span className="block text-sm font-medium text-text">
                        Lumières à la connexion
                      </span>
                      <span className="block text-xs text-text-dim">
                        Allumer automatiquement les lumières.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuper73DefaultLight((current) => !current)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                        super73DefaultLight ? "bg-primary" : "bg-surface"
                      }`}
                      aria-label={
                        super73DefaultLight
                          ? "Désactiver les lumières par défaut"
                          : "Activer les lumières par défaut"
                      }
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                          super73DefaultLight ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-dim">
                        Seuil Off-Road
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="80"
                        step="0.5"
                        value={super73AutoModeLowSpeedKmh}
                        onChange={(e) => setSuper73AutoModeLowSpeedKmh(e.target.value)}
                        className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span className="mt-1 block text-xs text-text-dim">
                        Passage EPAC → Off-Road si vitesse ≤ ce seuil.
                      </span>
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-text-dim">
                        Seuil EPAC
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="80"
                        step="0.5"
                        value={super73AutoModeHighSpeedKmh}
                        onChange={(e) => setSuper73AutoModeHighSpeedKmh(e.target.value)}
                        className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span className="mt-1 block text-xs text-text-dim">
                        Passage Off-Road → EPAC si vitesse ≥ ce seuil.
                      </span>
                    </label>
                  </div>

                  {invalidSuper73Thresholds && (
                    <p className="text-xs text-danger">
                      Le seuil Off-Road doit être strictement inférieur au seuil EPAC.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveSuper73Defaults}
                    disabled={updateProfile.isPending || invalidSuper73Thresholds}
                    className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
                  >
                    {updateProfile.isPending ? "Sauvegarde..." : "Enregistrer les réglages S73"}
                  </button>
                </div>

                <div className="mx-4 h-px bg-white/5" />
                <Link
                  to="/vehicle"
                  className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
                >
                  <div className="flex items-center gap-4">
                    <Bike size={20} className="text-primary-light" />
                    <span className="text-sm font-medium">Contrôle du vélo</span>
                  </div>
                  <ChevronRight size={18} className="text-text-dim" />
                </Link>
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
                <span className="text-sm font-medium">Signaler un problème</span>
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
                      Merci pour votre retour !
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
                      {(["bug", "feature"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setFeedbackType(t)}
                          className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                            feedbackType === t
                              ? "bg-primary/20 text-primary-light"
                              : "bg-surface-high text-text-muted"
                          }`}
                        >
                          {t === "bug" ? "Bug" : "Idée"}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={feedbackTitle}
                      onChange={(e) => setFeedbackTitle(e.target.value)}
                      placeholder="Titre"
                      required
                      minLength={3}
                      maxLength={200}
                      className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <textarea
                      value={feedbackDesc}
                      onChange={(e) => setFeedbackDesc(e.target.value)}
                      placeholder="Décrivez le problème ou votre idée..."
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
                      {submitFeedback.isPending ? "Envoi..." : "Envoyer"}
                    </button>
                    {submitFeedback.isError && (
                      <p className="text-center text-xs text-danger">
                        Erreur lors de l&apos;envoi. Réessayez.
                      </p>
                    )}
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Admin link (only visible for admins) */}
          {user.isAdmin && (
            <Link
              to="/admin"
              className="mt-4 flex w-full items-center justify-between rounded-lg bg-surface-high p-4 transition-colors hover:bg-surface-low"
            >
              <div className="flex items-center gap-4">
                <Shield size={20} className="text-primary-light" />
                <span className="text-sm font-medium">Administration</span>
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
              Déconnexion
            </div>
          </button>

          <button
            onClick={handleExportData}
            disabled={exportData.isPending}
            className="mt-4 w-full rounded-lg bg-surface-high py-4 text-xs font-bold uppercase tracking-widest text-text-muted active:scale-95 disabled:opacity-50"
          >
            <div className="flex items-center justify-center gap-2">
              <Download size={16} />
              {exportData.isPending ? "Export en cours..." : "Exporter mes données"}
            </div>
          </button>

          <button
            onClick={handleDeleteAccount}
            disabled={deleteAccount.isPending}
            className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-500/10 py-4 text-xs font-bold uppercase tracking-widest text-red-400 active:scale-95 disabled:opacity-50"
          >
            <div className="flex items-center justify-center gap-2">
              <Trash2 size={16} />
              {deleteAccount.isPending ? "Suppression..." : "Supprimer mon compte"}
            </div>
          </button>

          <p className="mt-4 text-center text-xs text-text-dim">v{__APP_VERSION__}</p>
        </section>
      </div>
    </>
  );
}
