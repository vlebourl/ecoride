import { useState, useRef, useCallback } from "react";
import {
  isBleSupported,
  scanAndConnect,
  readState,
  writeState,
  type Super73State,
  type Super73Mode,
} from "@/lib/super73-ble";

export type BleStatus = "disconnected" | "connecting" | "connected" | "unsupported" | "error";

const STATE_KEY = "ecoride-super73-state";

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

  const onDisconnected = useCallback(() => {
    setStatus("disconnected");
    serverRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    if (!enabled || !isBleSupported()) return;
    setStatus("connecting");
    setError(null);
    try {
      const device = await scanAndConnect();
      device.addEventListener("gattserverdisconnected", onDisconnected);
      deviceRef.current = device;
      serverRef.current = device.gatt!;

      const state = await readState(device.gatt!);
      setBikeState(state);
      cacheState(state);
      setStatus("connected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connexion échouée";
      // User cancelled the chooser — not an error
      if (msg.includes("cancelled") || msg.includes("NotFoundError")) {
        setStatus("disconnected");
      } else {
        setError(msg);
        setStatus("error");
      }
    }
  }, [enabled, onDisconnected]);

  const disconnect = useCallback(() => {
    if (deviceRef.current) {
      deviceRef.current.removeEventListener("gattserverdisconnected", onDisconnected);
      deviceRef.current.gatt?.disconnect();
      deviceRef.current = null;
      serverRef.current = null;
    }
    setStatus("disconnected");
  }, [onDisconnected]);

  const updateState = useCallback(
    async (patch: Partial<Super73State>) => {
      if (!serverRef.current?.connected || !bikeState) return;
      try {
        // Read current state before writing to avoid overwriting other fields
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
    // Toggle between eco (EPAC, modes 0-3 EU offset) and race (Off-Road, mode 3)
    // Per issue spec: EPAC = eco (mode 0 EU), Off-Road = race (mode 3 EU)
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
