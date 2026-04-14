// BLE protocol layer for Super73 electric bikes.
// Reverse-engineered from https://github.com/blopker/superduper

// ---- UUIDs ----

const METRICS_SERVICE = "00001554-1212-efde-1523-785feabcd123";
const REGISTER_ID_CHAR = "00001564-1212-efde-1523-785feabcd123";
const REGISTER_CHAR = "0000155f-1212-efde-1523-785feabcd123";
// Push notifications from the bike (unconfirmed — may not fire on all firmware versions).
const REGISTER_NOTIFIER_CHAR = "0000155e-1212-efde-1523-785feabcd123";

// ---- Types ----

export type Super73Mode = "eco" | "tour" | "sport" | "race";
export type BikeRegion = "eu" | "us";

export interface Super73State {
  mode: Super73Mode;
  assist: number; // 0-4
  light: boolean;
  region: BikeRegion;
}

// ---- Mode mapping ----

const MODE_ORDER: Super73Mode[] = ["eco", "tour", "sport", "race"];
const EU_OFFSET = 4;

export function decodeMode(byte: number): { mode: Super73Mode; region: BikeRegion } {
  if (byte >= EU_OFFSET) {
    return { mode: MODE_ORDER[byte - EU_OFFSET] ?? "eco", region: "eu" };
  }
  return { mode: MODE_ORDER[byte] ?? "eco", region: "us" };
}

export function encodeMode(mode: Super73Mode, region: BikeRegion): number {
  const idx = MODE_ORDER.indexOf(mode);
  return region === "eu" ? idx + EU_OFFSET : idx;
}

export function modeIndex(mode: Super73Mode): number {
  return MODE_ORDER.indexOf(mode);
}

// ---- Debug logging ----

export function isBleDebugEnabled(): boolean {
  try {
    return localStorage.getItem("ecoride-ble-debug") === "1";
  } catch {
    return false;
  }
}

const MODE_HUMAN: Record<Super73Mode, string> = {
  eco: "EPAC",
  tour: "Tour",
  sport: "Sport",
  race: "Off-Road",
};

export function bleDebugLog(source: string, bytes: Uint8Array, decoded: Super73State): void {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  const label = `${MODE_HUMAN[decoded.mode]} / assist=${decoded.assist} / lumière=${decoded.light ? "ON" : "OFF"} / ${decoded.region.toUpperCase()}`;
  const src = source.padEnd(12);
  console.debug(`[BLE:${src}] ${label}  ←  raw ${String(bytes.length).padStart(2)}B: ${hex}`);
}

// ---- Byte parsing ----

export function parseStateBytes(bytes: Uint8Array, source = "unknown"): Super73State {
  if (bytes.length < 6) throw new Error("Invalid state: expected at least 6 bytes");

  const assist = Math.min(Math.max(bytes[2]!, 0), 4);
  const light = bytes[4]! === 1;
  const { mode, region } = decodeMode(bytes[5]!);

  const state: Super73State = { mode, assist, light, region };
  if (isBleDebugEnabled()) bleDebugLog(source, bytes, state);
  return state;
}

export function buildWriteCommand(state: Super73State): Uint8Array {
  const modeByte = encodeMode(state.mode, state.region);
  return new Uint8Array([0, 209, state.light ? 1 : 0, state.assist, modeByte, 0, 0, 0, 0, 0]);
}

// ---- Capability check ----

export function isBleSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

// ---- BLE operations ----

const BLE_TIMEOUT = 5_000;
const SUPER73_NAME_PREFIXES = ["SUPER73", "S73", "super73", "s73"] as const;
const SELECTED_DEVICE_ID_KEY = "ecoride-super73-device-id";

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

function isSuper73DeviceName(name: string | undefined): boolean {
  if (!name) return false;
  const normalizedName = name.trim().toLowerCase();
  return normalizedName.startsWith("super73") || normalizedName.startsWith("s73");
}

/** Open the browser device picker, let the user select a Super73, and connect. */
export async function scanAndConnect(): Promise<BluetoothDevice> {
  const device = await navigator.bluetooth.requestDevice({
    filters: SUPER73_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
    optionalServices: [METRICS_SERVICE],
  });
  if (!device.gatt) throw new Error("GATT not available");
  await withTimeout(device.gatt.connect());
  saveSelectedDeviceId(device);
  return device;
}

/**
 * Try to reconnect to a previously paired Super73 without showing the picker.
 * Uses navigator.bluetooth.getDevices() (Chrome 85+). Returns null if no
 * paired device is found or if the API is unavailable.
 */
export async function reconnectPairedDevice(): Promise<BluetoothDevice | null> {
  if (!navigator.bluetooth.getDevices) return null;
  const devices = await navigator.bluetooth.getDevices();
  const preferredDeviceId = loadSelectedDeviceId();
  const preferredDevice = preferredDeviceId
    ? (devices.find((device) => device.id === preferredDeviceId) ?? null)
    : null;

  if (preferredDeviceId && !preferredDevice?.gatt) return null;

  const super73 = preferredDevice ?? devices.find((device) => isSuper73DeviceName(device.name));
  if (!super73?.gatt) return null;
  try {
    await withTimeout(super73.gatt.connect());
    saveSelectedDeviceId(super73);
    return super73;
  } catch {
    return null;
  }
}

async function getCharacteristics(server: BluetoothRemoteGATTServer) {
  const service = await withTimeout(server.getPrimaryService(METRICS_SERVICE));
  const [registerIdChar, registerChar] = await Promise.all([
    withTimeout(service.getCharacteristic(REGISTER_ID_CHAR)),
    withTimeout(service.getCharacteristic(REGISTER_CHAR)),
  ]);
  return { registerIdChar, registerChar };
}

export async function readState(
  server: BluetoothRemoteGATTServer,
  source = "poll",
): Promise<Super73State> {
  const { registerIdChar, registerChar } = await getCharacteristics(server);
  // Request state by writing [3, 0] to register ID
  await withTimeout(registerIdChar.writeValue(new Uint8Array([3, 0])));
  const value = await withTimeout(registerChar.readValue());
  return parseStateBytes(new Uint8Array(value.buffer), source);
}

export async function writeState(
  server: BluetoothRemoteGATTServer,
  state: Super73State,
): Promise<void> {
  const { registerChar } = await getCharacteristics(server);
  const command = buildWriteCommand(state);
  await withTimeout(registerChar.writeValue(command as unknown as BufferSource));
}

/**
 * Subscribe to state change notifications pushed by the bike.
 * Returns a cleanup function on success, or null if the firmware doesn't support it.
 * Note: REGISTER_NOTIFIER_CHAR existence is documented but unconfirmed in practice —
 * the caller should treat null as "notifier unavailable" and fall back to polling.
 */
export async function startStateNotifications(
  server: BluetoothRemoteGATTServer,
  handler: (state: Super73State) => void,
): Promise<(() => void) | null> {
  try {
    const service = await withTimeout(server.getPrimaryService(METRICS_SERVICE));
    const char = await withTimeout(service.getCharacteristic(REGISTER_NOTIFIER_CHAR));
    await withTimeout(char.startNotifications());
    const listener = (event: Event) => {
      const c = event.target as BluetoothRemoteGATTCharacteristic;
      if (!c.value) return;
      try {
        handler(parseStateBytes(new Uint8Array(c.value.buffer), "notifier"));
      } catch {
        // malformed packet — skip
      }
    };
    char.addEventListener("characteristicvaluechanged", listener);
    return () => char.removeEventListener("characteristicvaluechanged", listener);
  } catch {
    return null;
  }
}
