import {
  createContext,
  createElement,
  useState,
  useRef,
  useCallback,
  useEffect,
  useContext,
  type ReactNode,
} from "react";
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
const DEFAULT_AUTO_MODE_LOW_SPEED_KMH = 10;
const DEFAULT_AUTO_MODE_HIGH_SPEED_KMH = 17;

type AutoModeZone = "low" | "high" | null;

export type Super73TripModeSelection = "eco" | "race" | "auto";

function deriveTripModeSelection(
  state: Super73State | null,
  preferences: Super73Preferences,
  tracking: Super73TrackingInput,
  currentSelection: Super73TripModeSelection | null = null,
): Super73TripModeSelection {
  if (currentSelection === "auto" && tracking.isTracking) return "auto";
  if (preferences.autoModeEnabled && tracking.isTracking) return "auto";
  return state?.mode === "race" ? "race" : "eco";
}

function nextTripModeSelection(current: Super73TripModeSelection): Super73TripModeSelection {
  return current === "eco" ? "race" : current === "race" ? "auto" : "eco";
}

export interface Super73Preferences {
  autoModeEnabled: boolean;
  defaultMode: Super73Mode | null;
  defaultAssist: number | null;
  defaultLight: boolean | null;
  autoModeLowSpeedKmh?: number | null;
  autoModeHighSpeedKmh?: number | null;
}

export interface Super73TrackingInput {
  isTracking: boolean;
  speedKmh: number | null;
}

const DEFAULT_PREFERENCES: Super73Preferences = {
  autoModeEnabled: false,
  defaultMode: null,
  defaultAssist: null,
  defaultLight: null,
  autoModeLowSpeedKmh: DEFAULT_AUTO_MODE_LOW_SPEED_KMH,
  autoModeHighSpeedKmh: DEFAULT_AUTO_MODE_HIGH_SPEED_KMH,
};

const DEFAULT_TRACKING_INPUT: Super73TrackingInput = {
  isTracking: false,
  speedKmh: null,
};

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

export function buildStateFromPreferences(
  state: Super73State,
  preferences: Super73Preferences,
): Super73State | null {
  const next: Super73State = {
    ...state,
    mode: preferences.defaultMode ?? state.mode,
    assist: preferences.defaultAssist ?? state.assist,
    light: preferences.defaultLight ?? state.light,
  };

  return next.mode === state.mode && next.assist === state.assist && next.light === state.light
    ? null
    : next;
}

export function resolveAutoModeZone(
  speedKmh: number | null,
  lowSpeedThresholdKmh = DEFAULT_AUTO_MODE_LOW_SPEED_KMH,
  highSpeedThresholdKmh = DEFAULT_AUTO_MODE_HIGH_SPEED_KMH,
): AutoModeZone {
  if (speedKmh == null || !Number.isFinite(speedKmh)) return null;
  if (speedKmh <= lowSpeedThresholdKmh) return "low";
  if (speedKmh >= highSpeedThresholdKmh) return "high";
  return null;
}

export function resolveAutoSuper73Mode(zone: AutoModeZone): Super73Mode | null {
  if (zone === "low") return "race";
  if (zone === "high") return "eco";
  return null;
}

export interface UseSuper73Result {
  status: BleStatus;
  bikeState: Super73State | null;
  error: string | null;
  tripModeSelection: Super73TripModeSelection;
  connect: () => Promise<void>;
  disconnect: () => void;
  setMode: (mode: Super73Mode) => Promise<void>;
  setAssist: (level: number) => Promise<void>;
  setLight: (on: boolean) => Promise<void>;
  toggleMode: () => Promise<void>;
  cycleTripModeSelection: () => Promise<void>;
}

const NOOP_RESULT: UseSuper73Result = {
  status: "unsupported",
  bikeState: null,
  error: null,
  tripModeSelection: "eco",
  connect: async () => {},
  disconnect: () => {},
  setMode: async () => {},
  setAssist: async () => {},
  setLight: async () => {},
  toggleMode: async () => {},
  cycleTripModeSelection: async () => {},
};

const Super73Context = createContext<UseSuper73Result>(NOOP_RESULT);

function useSuper73Controller(
  enabled: boolean,
  preferences: Super73Preferences,
  tracking: Super73TrackingInput,
): UseSuper73Result {
  const [status, setStatus] = useState<BleStatus>(() =>
    !enabled ? "disconnected" : isBleSupported() ? "disconnected" : "unsupported",
  );
  const [bikeState, setBikeState] = useState<Super73State | null>(loadCachedState);
  const [error, setError] = useState<string | null>(null);
  const [tripModeSelection, setTripModeSelection] = useState<Super73TripModeSelection>("eco");

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualDisconnectRef = useRef(false);
  const lastAutoModeZoneRef = useRef<AutoModeZone>(null);

  const applyConnectionPreferences = useCallback(
    async (server: BluetoothRemoteGATTServer, state: Super73State) => {
      const preferredState = buildStateFromPreferences(state, preferences);
      if (!preferredState) return state;
      await writeState(server, preferredState);
      return preferredState;
    },
    [preferences],
  );

  // Attach device listeners and read initial state
  const attachDevice = useCallback(
    async (device: BluetoothDevice) => {
      deviceRef.current = device;
      serverRef.current = device.gatt!;
      reconnectAttemptsRef.current = 0;
      manualDisconnectRef.current = false;
      lastAutoModeZoneRef.current = null;

      const currentState = await readState(device.gatt!);
      const finalState = await applyConnectionPreferences(device.gatt!, currentState);
      setBikeState(finalState);
      cacheState(finalState);
      setStatus("connected");
    },
    [applyConnectionPreferences],
  );

  // Auto-reconnect on unexpected disconnect
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
    lastAutoModeZoneRef.current = null;
    if (manualDisconnectRef.current) {
      setStatus("disconnected");
      return;
    }
    reconnectTimerRef.current = setTimeout(tryReconnect, RECONNECT_DELAY);
  }, [tryReconnect]);

  useEffect(() => {
    const device = deviceRef.current;
    if (!device) return;
    device.addEventListener("gattserverdisconnected", onDisconnected);
    return () => {
      device.removeEventListener("gattserverdisconnected", onDisconnected);
    };
  }, [status, onDisconnected]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !isBleSupported()) return;
    if (status !== "disconnected") return;
    if (deviceRef.current) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

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
    lastAutoModeZoneRef.current = null;
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
    setTripModeSelection(nextMode === "race" ? "race" : "eco");
    await setMode(nextMode);
  }, [bikeState, setMode]);

  const cycleTripModeSelection = useCallback(async () => {
    const nextSelection = nextTripModeSelection(tripModeSelection);
    setTripModeSelection(nextSelection);
    lastAutoModeZoneRef.current = null;

    if (nextSelection === "auto") {
      if (!tracking.isTracking) return;
      const lowSpeedThresholdKmh =
        preferences.autoModeLowSpeedKmh ?? DEFAULT_AUTO_MODE_LOW_SPEED_KMH;
      const highSpeedThresholdKmh =
        preferences.autoModeHighSpeedKmh ?? DEFAULT_AUTO_MODE_HIGH_SPEED_KMH;
      const zone = resolveAutoModeZone(
        tracking.speedKmh,
        lowSpeedThresholdKmh,
        highSpeedThresholdKmh,
      );
      const targetMode = resolveAutoSuper73Mode(zone);
      if (targetMode && targetMode !== bikeState?.mode) {
        await setMode(targetMode);
      }
      return;
    }

    const targetMode: Super73Mode = nextSelection === "race" ? "race" : "eco";
    if (targetMode !== bikeState?.mode) {
      await setMode(targetMode);
    }
  }, [bikeState?.mode, setMode, tracking.isTracking, tracking.speedKmh, tripModeSelection]);

  useEffect(() => {
    setTripModeSelection((current) =>
      deriveTripModeSelection(bikeState, preferences, tracking, current),
    );
  }, [bikeState, preferences.autoModeEnabled, tracking.isTracking]);

  useEffect(() => {
    if (tripModeSelection !== "auto") {
      lastAutoModeZoneRef.current = null;
      return;
    }
    if (!tracking.isTracking || !bikeState || status !== "connected") return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const lowSpeedThresholdKmh = preferences.autoModeLowSpeedKmh ?? DEFAULT_AUTO_MODE_LOW_SPEED_KMH;
    const highSpeedThresholdKmh =
      preferences.autoModeHighSpeedKmh ?? DEFAULT_AUTO_MODE_HIGH_SPEED_KMH;
    const zone = resolveAutoModeZone(
      tracking.speedKmh,
      lowSpeedThresholdKmh,
      highSpeedThresholdKmh,
    );
    if (zone === null) return;
    if (zone === lastAutoModeZoneRef.current) return;

    const targetMode = resolveAutoSuper73Mode(zone);
    if (!targetMode || targetMode === bikeState.mode) {
      lastAutoModeZoneRef.current = zone;
      return;
    }

    lastAutoModeZoneRef.current = zone;
    void setMode(targetMode);
  }, [
    tripModeSelection,
    tracking.isTracking,
    tracking.speedKmh,
    bikeState,
    status,
    setMode,
    preferences.autoModeLowSpeedKmh,
    preferences.autoModeHighSpeedKmh,
  ]);

  if (!enabled) return NOOP_RESULT;
  if (!isBleSupported()) return NOOP_RESULT;

  return {
    status,
    bikeState,
    error,
    tripModeSelection,
    connect,
    disconnect,
    setMode,
    setAssist,
    setLight,
    toggleMode,
    cycleTripModeSelection,
  };
}

export function Super73Provider({
  enabled,
  preferences = DEFAULT_PREFERENCES,
  tracking = DEFAULT_TRACKING_INPUT,
  children,
}: {
  enabled: boolean;
  preferences?: Super73Preferences;
  tracking?: Super73TrackingInput;
  children: ReactNode;
}) {
  const ble = useSuper73Controller(enabled, preferences, tracking);
  return createElement(Super73Context.Provider, { value: ble }, children);
}

export function useSuper73(): UseSuper73Result {
  return useContext(Super73Context);
}
