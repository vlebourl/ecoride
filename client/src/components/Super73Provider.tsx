import type { ReactNode } from "react";
import { useProfile } from "@/hooks/queries";
import { Super73Provider as Super73ProviderBase } from "@/hooks/useSuper73";

export function Super73Provider({ children }: { children: ReactNode }) {
  const { data: profileData } = useProfile();
  const enabled = !!profileData?.user?.super73Enabled;

  return <Super73ProviderBase enabled={enabled}>{children}</Super73ProviderBase>;
}
