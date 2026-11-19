import { useCallback, useEffect, useState } from "react";
import { bikeStartSyncPlugin, isNativeApp, type BikeStartSyncStatus } from "@/lib/ble-native";
import {
  buildWriteCommand,
  loadSavedProtocol,
  loadSelectedDeviceId,
  type Super73Mode,
  type Super73Protocol,
  type Super73State,
} from "@/lib/super73-ble";
import { bleLog, describeError } from "@/lib/ble-log";
import {
  CONNECT_ASSIST_FLOOR,
  CONNECT_ASSIST_TARGET,
  loadCachedState,
  useSuper73,
} from "@/hooks/useSuper73";

/**
 * The frames the native sync writes when the bike powers on: the same light
 * off→on and assist floor→target transitions as runConnectInitSequence, folded
 * into two frames (the bike only follows a *change* of the register value).
 * Null when the protocol is unknown — no control frame for an unidentified bike.
 */
export function buildStartSyncPlan(
  defaultMode: Super73Mode | null,
  state: Pick<Super73State, "mode" | "region">,
  protocol: Super73Protocol,
): number[][] | null {
  if (protocol === "unknown") return null;
  const base = { mode: defaultMode ?? state.mode, region: state.region };
  return [
    { ...base, light: false, assist: CONNECT_ASSIST_FLOOR },
    { ...base, light: true, assist: CONNECT_ASSIST_TARGET },
  ].map((frame) => Array.from(buildWriteCommand(frame, protocol)));
}

/** Everything setPlan needs, from the last successful connection. Null before one. */
export function savedStartSyncPlan(defaultMode: Super73Mode | null) {
  const deviceId = loadSelectedDeviceId();
  const state = loadCachedState();
  const protocol = loadSavedProtocol();
  if (!deviceId || !state || protocol === "unknown") return null;
  const commands = buildStartSyncPlan(defaultMode, state, protocol);
  return commands ? { deviceId, protocol, commands } : null;
}

/**
 * Keeps the native plan in step with the rider's defaults: whenever they change
 * (and on startup) while the sync is enabled, the plan is pushed again.
 */
export function useBikeStartSyncPlanRefresh(enabled: boolean, defaultMode: Super73Mode | null) {
  useEffect(() => {
    if (!enabled || !isNativeApp()) return;
    let cancelled = false;
    void (async () => {
      const plugin = await bikeStartSyncPlugin();
      const status = await plugin.getStatus();
      const plan = savedStartSyncPlan(defaultMode);
      if (cancelled || !status.supported || !status.associated || !plan) return;
      await plugin.setPlan(plan);
    })().catch((e: unknown) => bleLog("start_sync_refresh_error", describeError(e)));
    return () => {
      cancelled = true;
    };
  }, [enabled, defaultMode]);
}

export type BikeStartSyncError = "noBike" | "failed";

export function useBikeStartSync(defaultMode: Super73Mode | null) {
  const ble = useSuper73();
  const [status, setStatus] = useState<BikeStartSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BikeStartSyncError | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const plugin = await bikeStartSyncPlugin();
    setStatus(await plugin.getStatus());
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    bikeStartSyncPlugin()
      .then((plugin) => plugin.getStatus())
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((e: unknown) => bleLog("start_sync_status_error", describeError(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const fail = (e: unknown, event: string) => {
    bleLog(event, describeError(e));
    setError("failed");
    setErrorDetail(e instanceof Error ? e.message : String(e));
  };

  const enable = async () => {
    const plan = savedStartSyncPlan(defaultMode);
    if (!plan) {
      setError("noBike");
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    // A connected bike stops advertising, and the association dialog would then
    // search forever: hang up first, reconnect once the rider has answered.
    const wasConnected = ble.status === "connected" || ble.status === "connecting";
    if (wasConnected) ble.disconnect();
    try {
      const plugin = await bikeStartSyncPlugin();
      await plugin.setPlan(plan);
      await plugin.enable({ deviceId: plan.deviceId });
    } catch (e) {
      fail(e, "start_sync_enable_error");
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
      if (wasConnected) void ble.reconnect();
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    try {
      const plugin = await bikeStartSyncPlugin();
      await plugin.disable();
    } catch (e) {
      fail(e, "start_sync_disable_error");
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
  };

  const setAutoOpen = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    try {
      const plugin = await bikeStartSyncPlugin();
      await plugin.setAutoOpen({ enabled });
      await refresh();
    } catch (e) {
      fail(e, "start_sync_auto_open_error");
    } finally {
      setBusy(false);
    }
  };

  return { status, busy, error, errorDetail, enable, disable, setAutoOpen };
}
