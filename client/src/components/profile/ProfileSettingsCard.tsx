import {
  Bell,
  BellOff,
  Bike,
  Bluetooth,
  ChevronDown,
  ChevronRight,
  Loader2,
  User,
} from "lucide-react";
import { MapCacheRow } from "@/components/MapCacheRow";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useT } from "@/i18n/provider";

interface ProfileSettingsCardProps {
  user: {
    name: string;
    email: string;
    createdAt: string;
    timezone: string | null;
    super73Enabled: boolean;
  };
  showPersonalInfo: boolean;
  push: {
    status: "loading" | "subscribed" | "unsubscribed" | "unsupported" | "denied";
    busy: boolean;
    toggle: () => void | Promise<void>;
  };
  bleSupported: boolean;
  profileUpdatePending: boolean;
  onTogglePersonalInfo: () => void;
  onVehicleClick: () => void;
  onSuper73RowClick: () => void;
  onSuper73ToggleClick: () => Promise<void>;
  formatMemberSince: (createdAt: string, timezone: string | null) => string;
}

export function ProfileSettingsCard({
  user,
  showPersonalInfo,
  push,
  bleSupported,
  profileUpdatePending,
  onTogglePersonalInfo,
  onVehicleClick,
  onSuper73RowClick,
  onSuper73ToggleClick,
  formatMemberSince,
}: ProfileSettingsCardProps) {
  const t = useT();

  return (
    <section className="space-y-2">
      <h2 className="mb-4 text-lg font-bold tracking-tight">{t("profile.settings.title")}</h2>
      <div className="overflow-hidden rounded-lg bg-surface-low">
        <button
          onClick={onTogglePersonalInfo}
          className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
        >
          <div className="flex items-center gap-4">
            <User size={20} className="text-text-muted" />
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
                {formatMemberSince(user.createdAt, user.timezone)}
              </div>
            </div>
          </div>
        )}

        <div className="mx-4 h-px bg-white/5" />

        <button
          onClick={onVehicleClick}
          className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
        >
          <div className="flex items-center gap-4">
            <Bike size={20} className="text-text-muted" />
            <span className="text-sm font-medium">{t("profile.settings.myVehicle")}</span>
          </div>
          <ChevronRight size={18} className="text-text-dim" />
        </button>

        <div className="mx-4 h-px bg-white/5" />

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

        {user.super73Enabled && (
          <div className="flex w-full items-center justify-between p-4">
            <button
              type="button"
              onClick={onSuper73RowClick}
              disabled={!user.super73Enabled}
              className="flex min-w-0 items-center gap-4 text-left"
            >
              <Bluetooth
                size={20}
                className={user.super73Enabled ? "text-primary-light" : "text-text-muted"}
              />
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">
                  {t("profile.settings.super73Connected")}
                </span>
                {!bleSupported && (
                  <span className="text-xs text-text-dim">
                    {t("profile.settings.super73Unsupported")}
                  </span>
                )}
                <span className="text-xs text-primary/70">
                  {t("profile.settings.super73Enabled")}
                </span>
              </div>
              <ChevronRight size={18} className="shrink-0 text-text-dim" />
            </button>
            <button
              onClick={() => {
                void onSuper73ToggleClick();
              }}
              disabled={profileUpdatePending}
              aria-label={
                user.super73Enabled
                  ? t("profile.settings.super73DisableAria")
                  : t("profile.settings.super73EnableAria")
              }
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${
                user.super73Enabled ? "bg-primary" : "bg-surface-high"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                  user.super73Enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        )}

        <div className="mx-4 h-px bg-white/5" />
        <MapCacheRow />
        <div className="mx-4 h-px bg-white/5" />
        <LanguageSwitcher />
      </div>
    </section>
  );
}
