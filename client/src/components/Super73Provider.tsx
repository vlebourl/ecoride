import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useProfile } from "@/hooks/queries";
import { useAppGpsTracking } from "@/hooks/useGpsTracking";
import { Super73Provider as Super73ProviderBase, useSuper73 } from "@/hooks/useSuper73";
import { useT } from "@/i18n/provider";

export function Super73Provider({ children }: { children: ReactNode }) {
  const { data: profileData } = useProfile();
  const gps = useAppGpsTracking();
  const user = profileData?.user;
  const enabled = !!user?.super73Enabled;

  return (
    <Super73ProviderBase
      enabled={enabled}
      preferences={{
        autoModeEnabled: user?.super73AutoModeEnabled ?? false,
        defaultMode: user?.super73DefaultMode ?? null,
        defaultAssist: user?.super73DefaultAssist ?? null,
        defaultLight: user?.super73DefaultLight ?? null,
        autoModeLowSpeedKmh: user?.super73AutoModeLowSpeedKmh ?? 10,
        autoModeHighSpeedKmh: user?.super73AutoModeHighSpeedKmh ?? 17,
      }}
      tracking={{
        isTracking: gps.state.isTracking && !gps.state.isPaused,
        speedKmh: gps.state.speedKmh,
      }}
    >
      {children}
      <EpacPollFallbackBanner />
    </Super73ProviderBase>
  );
}

function EpacPollFallbackBanner() {
  const t = useT();
  const ble = useSuper73();
  if (!ble.epacPollFallbackWarning) return null;
  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 rounded-2xl border border-warning/40 bg-warning/10 p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-bold text-text">{t("super73.epacPollFallback.title")}</p>
          <p className="mt-0.5 text-xs text-text-muted">{t("super73.epacPollFallback.body")}</p>
        </div>
        <button
          onClick={ble.dismissEpacPollFallback}
          className="shrink-0 rounded-lg p-1 text-text-muted active:scale-95"
          aria-label={t("super73.epacPollFallback.dismissAria")}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
