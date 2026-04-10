// BLE protocol layer for CSC (Cycling Speed and Cadence) sensors.
// Compatible with any Bluetooth SIG standard CSC device (Wahoo, Garmin, XOSS, etc.).
// Service UUID: 0x1816, Measurement characteristic: 0x2A5B

// ---- Constants ----

const CSC_SERVICE = 0x1816;
const CSC_MEASUREMENT_CHAR = 0x2a5b;

const BLE_TIMEOUT = 5_000;
const SELECTED_DEVICE_ID_KEY = "ecoride-ble-speed-device-id";

// ---- Types ----

export interface CscSample {
  /** Cumulative wheel revolutions at this sample */
  wheelRevs: number;
  /** Last wheel event time, in 1/1024 s units (16-bit, wraps at 65536) */
  wheelEventTime: number;
  /** Cumulative crank revolutions, if flag bit 1 set */
  crankRevs: number | null;
  /** Last crank event time, in 1/1024 s units, if flag bit 1 set */
  crankEventTime: number | null;
}

export interface CscSpeedResult {
  speedKmh: number;
  cadenceRpm: number | null;
}

// ---- Pure parsing ----

/**
 * Parse a raw CSC Measurement DataView notification.
 * Returns null when there are no wheel revolution data (flag bit 0 not set),
 * or when this is the first sample (no previous to delta against).
 *
 * CSC Measurement format (BT SIG):
 *   byte 0: flags (bit 0 = wheel data, bit 1 = crank data)
 *   if bit 0: uint32 LE cumulative wheel revs + uint16 LE last wheel event time (1/1024 s)
 *   if bit 1: uint16 LE cumulative crank revs + uint16 LE last crank event time (1/1024 s)
 */
export function parseCscMeasurement(dv: DataView): CscSample | null {
  if (dv.byteLength < 1) return null;
  const flags = dv.getUint8(0);
  const hasWheel = (flags & 0x01) !== 0;
  const hasCrank = (flags & 0x02) !== 0;

  if (!hasWheel) return null;
  if (dv.byteLength < 7) return null;

  const wheelRevs = dv.getUint32(1, true);
  const wheelEventTime = dv.getUint16(5, true);

  let crankRevs: number | null = null;
  let crankEventTime: number | null = null;

  if (hasCrank && dv.byteLength >= 11) {
    crankRevs = dv.getUint16(7, true);
    crankEventTime = dv.getUint16(9, true);
  }

  return { wheelRevs, wheelEventTime, crankRevs, crankEventTime };
}

/**
 * Compute speed (km/h) and cadence (rpm) from two consecutive CSC samples.
 * Returns { speedKmh: 0, cadenceRpm: null } when stationary (Δtime === 0).
 * wheelCircumferenceMm: configured wheel circumference in millimetres.
 */
export function computeCscSpeed(
  prev: CscSample,
  curr: CscSample,
  wheelCircumferenceMm: number,
): CscSpeedResult {
  // 16-bit timestamp wraps at 65536 (1/1024 s units)
  const deltaTime = (curr.wheelEventTime - prev.wheelEventTime + 65536) % 65536;
  const deltaRevs = curr.wheelRevs - prev.wheelRevs;

  let speedKmh = 0;
  if (deltaTime > 0 && deltaRevs > 0) {
    const distanceKm = (deltaRevs * wheelCircumferenceMm) / 1_000_000;
    const timeSeconds = deltaTime / 1024;
    speedKmh = (distanceKm / timeSeconds) * 3600;
  }

  let cadenceRpm: number | null = null;
  if (
    curr.crankRevs !== null &&
    prev.crankRevs !== null &&
    curr.crankEventTime !== null &&
    prev.crankEventTime !== null
  ) {
    const deltaCrankTime = (curr.crankEventTime - prev.crankEventTime + 65536) % 65536;
    const deltaCrankRevs = curr.crankRevs - prev.crankRevs;
    if (deltaCrankTime > 0) {
      cadenceRpm = (deltaCrankRevs / (deltaCrankTime / 1024)) * 60;
    }
  }

  return { speedKmh, cadenceRpm };
}

// ---- Capability check ----

export function isBleSpeedSensorSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

// ---- BLE operations ----

function withTimeout<T>(promise: Promise<T>, ms = BLE_TIMEOUT): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("BLE timeout")), ms)),
  ]);
}

function loadSelectedDeviceId(): string | null {
  try {
    return localStorage.getItem(SELECTED_DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function saveSelectedDeviceId(device: BluetoothDevice): void {
  if (!device.id) return;
  try {
    localStorage.setItem(SELECTED_DEVICE_ID_KEY, device.id);
  } catch {
    // localStorage unavailable — reconnect falls back to fresh selection
  }
}

export function clearSelectedDeviceId(): void {
  try {
    localStorage.removeItem(SELECTED_DEVICE_ID_KEY);
  } catch {
    // ignore
  }
}

/** Open the browser device picker and connect to a CSC speed sensor. */
export async function scanAndConnectSpeedSensor(): Promise<BluetoothDevice> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [CSC_SERVICE] }],
  });
  if (!device.gatt) throw new Error("GATT not available");
  await withTimeout(device.gatt.connect());
  saveSelectedDeviceId(device);
  return device;
}

/**
 * Try to reconnect to a previously paired CSC sensor without showing the picker.
 * Returns null if no paired device is found or the API is unavailable.
 */
export async function reconnectPairedSpeedSensor(): Promise<BluetoothDevice | null> {
  if (!navigator.bluetooth.getDevices) return null;
  const devices = await navigator.bluetooth.getDevices();
  const preferredId = loadSelectedDeviceId();
  const preferred = preferredId ? (devices.find((d) => d.id === preferredId) ?? null) : null;
  const target = preferred ?? null;
  if (!target?.gatt) return null;
  try {
    await withTimeout(target.gatt.connect());
    return target;
  } catch {
    return null;
  }
}

/**
 * Subscribe to CSC speed notifications.
 * Returns an unsubscribe function.
 */
export async function subscribeSpeedSensor(
  server: BluetoothRemoteGATTServer,
  onSample: (result: CscSpeedResult) => void,
  wheelCircumferenceMm: number,
): Promise<() => void> {
  const service = await withTimeout(server.getPrimaryService(CSC_SERVICE));
  const char = await withTimeout(service.getCharacteristic(CSC_MEASUREMENT_CHAR));

  let prevSample: CscSample | null = null;

  const handler = (event: Event) => {
    const dv = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!dv) return;
    const sample = parseCscMeasurement(dv);
    if (!sample) return;
    if (prevSample !== null) {
      onSample(computeCscSpeed(prevSample, sample, wheelCircumferenceMm));
    }
    prevSample = sample;
  };

  char.addEventListener("characteristicvaluechanged", handler);
  await withTimeout(char.startNotifications());

  return () => {
    char.removeEventListener("characteristicvaluechanged", handler);
    char.stopNotifications().catch(() => {});
  };
}
