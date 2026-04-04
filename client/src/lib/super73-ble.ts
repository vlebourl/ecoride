// BLE protocol layer for Super73 electric bikes.
// Reverse-engineered from https://github.com/blopker/superduper

// ---- UUIDs ----

const METRICS_SERVICE = "00001554-1212-efde-1523-785feabcd123";
const REGISTER_ID_CHAR = "00001564-1212-efde-1523-785feabcd123";
const REGISTER_CHAR = "0000155f-1212-efde-1523-785feabcd123";

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

// ---- Byte parsing ----

export function parseStateBytes(bytes: Uint8Array): Super73State {
  if (bytes.length < 6) throw new Error("Invalid state: expected at least 6 bytes");

  const assist = Math.min(Math.max(bytes[2]!, 0), 4);
  const light = bytes[4]! === 1;
  const { mode, region } = decodeMode(bytes[5]!);

  return { mode, assist, light, region };
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

function withTimeout<T>(promise: Promise<T>, ms = BLE_TIMEOUT): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("BLE timeout")), ms)),
  ]);
}

/** Open the browser device picker, let the user select a Super73, and connect. */
export async function scanAndConnect(): Promise<BluetoothDevice> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "SUPER73" }, { namePrefix: "S73" }],
    optionalServices: [METRICS_SERVICE],
  });
  if (!device.gatt) throw new Error("GATT not available");
  await withTimeout(device.gatt.connect());
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
  const super73 = devices.find((d) => d.name?.startsWith("SUPER73") || d.name?.startsWith("S73"));
  if (!super73?.gatt) return null;
  try {
    await withTimeout(super73.gatt.connect());
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

export async function readState(server: BluetoothRemoteGATTServer): Promise<Super73State> {
  const { registerIdChar, registerChar } = await getCharacteristics(server);
  // Request state by writing [3, 0] to register ID
  await withTimeout(registerIdChar.writeValue(new Uint8Array([3, 0])));
  const value = await withTimeout(registerChar.readValue());
  return parseStateBytes(new Uint8Array(value.buffer));
}

export async function writeState(
  server: BluetoothRemoteGATTServer,
  state: Super73State,
): Promise<void> {
  const { registerChar } = await getCharacteristics(server);
  const command = buildWriteCommand(state);
  await withTimeout(registerChar.writeValue(command as unknown as BufferSource));
}
