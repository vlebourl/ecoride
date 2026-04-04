import { useState, useRef, useCallback, useEffect } from "react";
import {
  isBleSupported,
  scanAndConnect,
  reconnectPairedDevice,
  readState,
  writeState,
  type Super73State,
  type Super73Mode,
} from "@/lib/super73-ble";

export type BleStatus = "disconnected" | "connecting" | "connected" | "unsupported" | "error";

const STATE_KEY = "ecoride-super73-state";
const RECONNECT_DELAY = 2_000;
const MAX_RECONNECT_ATTEMPTS = 1;

function loadCachedState(): Super73State | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as Super73State) : null;
  } catch {
    return null;
  }
}

function cacheState(state: Super73State) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full — ignore
  }
}

export interface UseSuper73Result {
  status: BleStatus;
  bikeState: Super73State | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  setMode: (mode: Super73Mode) => Promise<void>;
  setAssist: (level: number) => Promise<void>;
  setLight: (on: boolean) => Promise<void>;
  toggleMode: () => Promise<void>;
}

const NOOP_RESULT: UseSuper73Result = {
  status: "unsupported",
  bikeState: null,
  error: null,
  connect: async () => {},
  disconnect: () => {},
  setMode: async () => {},
  setAssist: async () => {},
  setLight: async () => {},
  toggleMode: async () => {},
};

export function useSuper73(enabled: boolean): UseSuper73Result {
  const [status, setStatus] = useState<BleStatus>(() =>
    !enabled ? "disconnected" : isBleSupported() ? "disconnected" : "unsupported",
  );
  const [bikeState, setBikeState] = useState<Super73State | null>(loadCachedState);
  const [error, setError] = useState<string | null>(null);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualDisconnectRef = useRef(false);

  // Attach device listeners and read initial state
  const attachDevice = useCallback(async (device: BluetoothDevice) => {
    deviceRef.current = device;
    serverRef.current = device.gatt!;
    reconnectAttemptsRef.current = 0;
    manualDisconnectRef.current = false;

    const state = await readState(device.gatt!);
    setBikeState(state);
    cacheState(state);
    setStatus("connected");
  }, []);

  // (2) Auto-reconnect on unexpected disconnect
  const tryReconnect = useCallback(async () => {
    if (manualDisconnectRef.current || reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus("disconnected");
      return;
    }
    reconnectAttemptsRef.current += 1;
    setStatus("connecting");
    try {
      const device = await reconnectPairedDevice();
      if (device) {
        await attachDevice(device);
      } else {
        setStatus("disconnected");
      }
    } catch {
      setStatus("disconnected");
    }
  }, [attachDevice]);

  const onDisconnected = useCallback(() => {
    serverRef.current = null;
    if (manualDisconnectRef.current) {
      setStatus("disconnected");
      return;
    }
    // Auto-retry after a short delay
    reconnectTimerRef.current = setTimeout(tryReconnect, RECONNECT_DELAY);
  }, [tryReconnect]);

  // Wire up disconnect listener whenever device changes
  useEffect(() => {
    const device = deviceRef.current;
    if (!device) return;
    device.addEventListener("gattserverdisconnected", onDisconnected);
    return () => {
      device.removeEventListener("gattserverdisconnected", onDisconnected);
    };
  }, [status, onDisconnected]); // re-attach when status changes (new device)

  // Cleanup reconnect timer on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  // (1) Auto-reconnect to paired device on mount
  useEffect(() => {
    if (!enabled || !isBleSupported()) return;
    if (status !== "disconnected") return;
    if (deviceRef.current) return; // already have a device

    let cancelled = false;
    (async () => {
      const device = await reconnectPairedDevice();
      if (cancelled || !device) return;
      setStatus("connecting");
      try {
        await attachDevice(device);
      } catch {
        setStatus("disconnected");
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only run on mount (enabled won't change mid-render in practice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Manual connect via picker
  const connect = useCallback(async () => {
    if (!enabled || !isBleSupported()) return;
    setStatus("connecting");
    setError(null);
    try {
      const device = await scanAndConnect();
      await attachDevice(device);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connexion échouée";
      if (msg.includes("cancelled") || msg.includes("NotFoundError")) {
        setStatus("disconnected");
      } else {
        setError(msg);
        setStatus("error");
      }
    }
  }, [enabled, attachDevice]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (deviceRef.current) {
      deviceRef.current.gatt?.disconnect();
      deviceRef.current = null;
      serverRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  const updateState = useCallback(
    async (patch: Partial<Super73State>) => {
      if (!serverRef.current?.connected || !bikeState) return;
      try {
        const current = await readState(serverRef.current);
        const next: Super73State = { ...current, ...patch };
        await writeState(serverRef.current, next);
        setBikeState(next);
        cacheState(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur d'écriture BLE");
        setStatus("error");
      }
    },
    [bikeState],
  );

  const setMode = useCallback((mode: Super73Mode) => updateState({ mode }), [updateState]);

  const setAssist = useCallback(
    (level: number) => updateState({ assist: Math.min(Math.max(level, 0), 4) }),
    [updateState],
  );

  const setLight = useCallback((on: boolean) => updateState({ light: on }), [updateState]);

  const toggleMode = useCallback(async () => {
    if (!bikeState) return;
    const nextMode: Super73Mode = bikeState.mode === "race" ? "eco" : "race";
    await setMode(nextMode);
  }, [bikeState, setMode]);

  if (!enabled) return NOOP_RESULT;
  if (!isBleSupported()) return NOOP_RESULT;

  return {
    status,
    bikeState,
    error,
    connect,
    disconnect,
    setMode,
    setAssist,
    setLight,
    toggleMode,
  };
}
