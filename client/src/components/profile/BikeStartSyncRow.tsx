import { Loader2, Power } from "lucide-react";
import { useBikeStartSync, savedStartSyncPlan } from "@/hooks/useBikeStartSync";
import { useI18n } from "@/i18n/provider";
import type { Super73Mode } from "@/lib/super73-ble";

/** Opt-in for the native background sync. Renders nothing outside Android 12+. */
export function BikeStartSyncRow({ defaultMode }: { defaultMode: Super73Mode | null }) {
  const { t, locale } = useI18n();
  const sync = useBikeStartSync(defaultMode);
  if (!sync.status?.supported) return null;

  const active = sync.status.associated && sync.status.hasPlan;
  const hasBike = savedStartSyncPlan(defaultMode) !== null;
  const last = sync.status.lastCompletedAt;
  const detail = sync.busy
    ? t("profile.settings.startSyncPending")
    : sync.error === "failed"
      ? t("profile.settings.startSyncFailed", { detail: sync.errorDetail ?? "" })
      : active
        ? last
          ? t("profile.settings.startSyncLast", {
              date: new Date(last).toLocaleString(locale, {
                dateStyle: "short",
                timeStyle: "short",
              }),
            })
          : t("profile.settings.startSyncNever")
        : !hasBike || sync.error === "noBike"
          ? t("profile.settings.startSyncNoBike")
          : t("profile.settings.startSyncDescription");

  return (
    <div className="flex w-full items-center justify-between gap-4 p-4">
      <div className="flex min-w-0 items-center gap-4">
        <Power size={20} className={active ? "text-primary-light" : "text-text-muted"} />
        <div className="flex min-w-0 flex-col items-start">
          <span className="text-sm font-medium">{t("profile.settings.startSyncTitle")}</span>
          {active && (
            <span className="text-xs text-primary/70">{t("profile.settings.startSyncActive")}</span>
          )}
          <span className="text-xs text-text-dim">{detail}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={active ? sync.disable : sync.enable}
        disabled={sync.busy || (!active && !hasBike)}
        className="shrink-0 rounded-full bg-surface-high px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        {sync.busy ? (
          <Loader2 size={14} className="animate-spin" />
        ) : active ? (
          t("profile.settings.startSyncDisable")
        ) : (
          t("profile.settings.startSyncEnable")
        )}
      </button>
    </div>
  );
}
