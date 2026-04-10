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
  isBleSpeedSensorSupported,
  scanAndConnectSpeedSensor,
  reconnectPairedSpeedSensor,
  subscribeSpeedSensor,
  clearSelectedDeviceId,
} from "@/lib/ble-speed-sensor";

// ---- Types ----

export type BleSpeedSensorStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "unsupported"
  | "error";

export interface BleSpeedSensorState {
  status: BleSpeedSensorStatus;
  speedKmh: number | null;
  cadenceRpm: number | null;
  deviceName: string | null;
  error: string | null;
}

export interface UseBleSpeedSensorResult {
  state: BleSpeedSensorState;
  pair: () => Promise<void>;
  disconnect: () => void;
  wheelCircumferenceMm: number;
  setWheelCircumferenceMm: (mm: number) => void;
}

// ---- Constants ----

const WHEEL_MM_KEY = "ecoride-ble-wheel-mm";
// 27.5" × 2.4 (Super73) — fits most cargo/comfort bikes
const DEFAULT_WHEEL_MM = 2215;
const RECONNECT_DELAY = 2_000;
// If no notification arrives within this window, clear displayed speed
// (sensor goes to sleep at standstill, we should not freeze the last reading)
const STALE_TIMEOUT_MS = 3_500;

// ---- localStorage helpers ----

function loadWheelMm(): number {
  try {
    const raw = localStorage.getItem(WHEEL_MM_KEY);
    const parsed = raw !== null ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WHEEL_MM;
  } catch {
    return DEFAULT_WHEEL_MM;
  }
}

function saveWheelMm(mm: number): void {
  try {
    localStorage.setItem(WHEEL_MM_KEY, String(mm));
  } catch {
    // ignore
  }
}

// ---- Context ----

const NOOP_RESULT: UseBleSpeedSensorResult = {
  state: {
    status: "unsupported",
    speedKmh: null,
    cadenceRpm: null,
    deviceName: null,
    error: null,
  },
  pair: async () => {},
  disconnect: () => {},
  wheelCircumferenceMm: DEFAULT_WHEEL_MM,
  setWheelCircumferenceMm: () => {},
};

const BleSpeedSensorContext = createContext<UseBleSpeedSensorResult>(NOOP_RESULT);

// ---- Controller ----

function useBleSpeedSensorController(): UseBleSpeedSensorResult {
  const [status, setStatus] = useState<BleSpeedSensorStatus>(() =>
    isBleSpeedSensorSupported() ? "disconnected" : "unsupported",
  );
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [cadenceRpm, setCadenceRpm] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wheelCircumferenceMm, setWheelCircumferenceMmState] = useState<number>(loadWheelMm);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const manualDisconnectRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref so the stale-timeout closure always sees the latest value
  const wheelMmRef = useRef(wheelCircumferenceMm);
  wheelMmRef.current = wheelCircumferenceMm;

  const clearStaleTimer = useCallback(() => {
    if (staleTimerRef.current !== null) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }, []);

  const resetStaleTimer = useCallback(() => {
    clearStaleTimer();
    staleTimerRef.current = setTimeout(() => {
      setSpeedKmh(null);
      setCadenceRpm(null);
    }, STALE_TIMEOUT_MS);
  }, [clearStaleTimer]);

  const stopSubscription = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    clearStaleTimer();
  }, [clearStaleTimer]);

  const attachDevice = useCallback(
    async (device: BluetoothDevice) => {
      deviceRef.current = device;
      manualDisconnectRef.current = false;
      setDeviceName(device.name ?? null);

      const server = device.gatt!;
      const unsub = await subscribeSpeedSensor(
        server,
        (sample) => {
          setSpeedKmh(sample.speedKmh);
          setCadenceRpm(sample.cadenceRpm);
          resetStaleTimer();
        },
        wheelMmRef.current,
      );

      unsubscribeRef.current = unsub;
      setStatus("connected");
      setError(null);
    },
    [resetStaleTimer],
  );

  const tryReconnect = useCallback(async () => {
    if (manualDisconnectRef.current) {
      setStatus("disconnected");
      return;
    }
    setStatus("connecting");
    try {
      const device = await reconnectPairedSpeedSensor();
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
    stopSubscription();
    setSpeedKmh(null);
    setCadenceRpm(null);
    if (manualDisconnectRef.current) {
      setStatus("disconnected");
      return;
    }
    reconnectTimerRef.current = setTimeout(tryReconnect, RECONNECT_DELAY);
  }, [tryReconnect, stopSubscription]);

  // Attach disconnect listener whenever the device or status changes
  useEffect(() => {
    const device = deviceRef.current;
    if (!device) return;
    device.addEventListener("gattserverdisconnected", onDisconnected);
    return () => {
      device.removeEventListener("gattserverdisconnected", onDisconnected);
    };
  }, [status, onDisconnected]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      clearStaleTimer();
    };
  }, [clearStaleTimer]);

  // Auto-reconnect on mount if a device was previously paired
  useEffect(() => {
    if (!isBleSpeedSensorSupported()) return;
    if (status !== "disconnected") return;
    if (deviceRef.current) return;

    let cancelled = false;
    void (async () => {
      const device = await reconnectPairedSpeedSensor();
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
  }, []);

  const pair = useCallback(async () => {
    if (!isBleSpeedSensorSupported()) return;
    setStatus("connecting");
    setError(null);
    try {
      const device = await scanAndConnectSpeedSensor();
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
  }, [attachDevice]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    stopSubscription();
    clearSelectedDeviceId();
    if (deviceRef.current) {
      deviceRef.current.gatt?.disconnect();
      deviceRef.current = null;
    }
    setSpeedKmh(null);
    setCadenceRpm(null);
    setDeviceName(null);
    setStatus("disconnected");
  }, [stopSubscription]);

  const setWheelCircumferenceMm = useCallback((mm: number) => {
    setWheelCircumferenceMmState(mm);
    saveWheelMm(mm);
  }, []);

  if (!isBleSpeedSensorSupported()) return NOOP_RESULT;

  return {
    state: { status, speedKmh, cadenceRpm, deviceName, error },
    pair,
    disconnect,
    wheelCircumferenceMm,
    setWheelCircumferenceMm,
  };
}

// ---- Provider ----

export function BleSpeedSensorProvider({ children }: { children: ReactNode }) {
  const value = useBleSpeedSensorController();
  return createElement(BleSpeedSensorContext.Provider, { value }, children);
}

// ---- Hook ----

export function useBleSpeedSensor(): UseBleSpeedSensorResult {
  return useContext(BleSpeedSensorContext);
}
