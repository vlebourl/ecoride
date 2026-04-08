import type { ReactNode } from "react";
import { useProfile } from "@/hooks/queries";
import { useAppGpsTracking } from "@/hooks/useGpsTracking";
import { Super73Provider as Super73ProviderBase } from "@/hooks/useSuper73";

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
    </Super73ProviderBase>
  );
}
