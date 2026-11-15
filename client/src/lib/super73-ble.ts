// BLE protocol layer for Super73 electric bikes.
// Reverse-engineered from https://github.com/blopker/superduper

import { bleLog, describeError } from "@/lib/ble-log";
import { isNativeBle, nativeDeviceById, nativeScan } from "@/lib/ble-native";

// ---- UUIDs ----

const METRICS_SERVICE = "00001554-1212-efde-1523-785feabcd123";
const REGISTER_ID_CHAR = "00001564-1212-efde-1523-785feabcd123";
const REGISTER_CHAR = "0000155f-1212-efde-1523-785feabcd123";
// Push notifications from the bike (unconfirmed — may not fire on all firmware versions).
const REGISTER_NOTIFIER_CHAR = "0000155e-1212-efde-1523-785feabcd123";
// Application authentication (see authenticate()).
const AUTH_SERVICE = "00002554-1212-efde-1523-785feabcd123";
const AUTH_CHALLENGE_CHAR = "00002556-1212-efde-1523-785feabcd123";
const AUTH_RESPONSE_CHAR = "00002557-1212-efde-1523-785feabcd123";
const AUTH_STATE_CHAR = "00002558-1212-efde-1523-785feabcd123";
// Factory key the firmware creates on first boot.
const AUTH_DEFAULT_KEY = new Uint8Array(20).fill(0xff);
// Standard Device Information — open reads, no pairing or app auth needed.
const DEVICE_INFO_SERVICE = "0000180a-0000-1000-8000-00805f9b34fb";
const FIRMWARE_REVISION_CHAR = "00002a26-0000-1000-8000-00805f9b34fb";

// ---- Protocol version ----
//
// Two display firmwares speak different control frames (superduper
// docs/ble_protocol.md): v1 (221122) writes 00D1 and reports state in record
// 0300; v2 (250426) writes 00C1 and reports state in records 00D0 + 00D9 — where
// 00D1 is a *telemetry* record. Sending the wrong family's frame is at best
// ignored, so the version is resolved on every connection and an unknown bike
// gets no control command at all.

export type Super73Protocol = "v1" | "v2" | "unknown";

const V1_STATE_RECORD = [0x03, 0x00] as const;
const V1_RIDE_RECORD = [0x02, 0x03] as const;
const V2_CONTROL_RECORD = [0x00, 0xd0] as const;
const V2_MODE_RECORD = [0x00, 0xd9] as const;

/** The advertised GAP name is the documented discriminator (exact match). */
export function protocolFromName(name: string | undefined): Super73Protocol {
  if (name === "SUPER73") return "v1";
  if (name === "S73 FTEX") return "v2";
  return "unknown";
}

/** Device Information Firmware Revision (0x2a26). Unknown builds stay unknown. */
export function protocolFromFirmware(revision: string): Super73Protocol {
  const build = revision.replace(/\0/g, "").trim();
  if (build === "221122") return "v1";
  if (build === "250426") return "v2";
  return "unknown";
}

// Keyed by GATT server: Web Bluetooth reuses the same object across reconnects,
// and authenticate() re-resolves it on each connection.
const protocols = new WeakMap<BluetoothRemoteGATTServer, Super73Protocol>();
// v2 splits state across two telemetry records; notifications patch this.
const lastStates = new WeakMap<BluetoothRemoteGATTServer, Super73State>();

// ponytail: callers that never authenticated (legacy tests, bikes without the
// auth service that predate detection) keep the historical v1 behaviour.
export function getProtocol(server: BluetoothRemoteGATTServer): Super73Protocol {
  return protocols.get(server) ?? "v1";
}

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

function bleDebugLog(source: string, bytes: Uint8Array, decoded: Super73State): void {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  const label = `${MODE_HUMAN[decoded.mode]} / assist=${decoded.assist} / lumière=${decoded.light ? "ON" : "OFF"} / ${decoded.region.toUpperCase()}`;
  const src = source.padEnd(12);
  console.info(`[BLE:${src}] ${label}  ←  raw ${String(bytes.length).padStart(2)}B: ${hex}`);
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

/** v2 state lives in two records: 00D0 (assist, lights) and 00D9 (ride preset). */
function parseV2State(d0: Uint8Array, d9: Uint8Array): Super73State {
  if (!hasRecordId(d0, V2_CONTROL_RECORD) || !hasRecordId(d9, V2_MODE_RECORD)) {
    throw new Error("Invalid v2 state records");
  }
  return {
    mode: MODE_ORDER[d9[5]!] ?? "eco",
    assist: Math.min(Math.max(d0[2]!, 0), 4),
    light: d0[4] === 1,
    // ponytail: v2 carries no region on the wire; the ride preset is the mode.
    region: "us",
  };
}

export function buildWriteCommand(
  state: Super73State,
  protocol: Super73Protocol = "v1",
): Uint8Array {
  if (protocol === "v2") {
    return new Uint8Array([
      0x00,
      0xc1,
      state.light ? 1 : 0,
      state.assist,
      modeIndex(state.mode),
      0,
      0,
      0,
      0,
      0,
    ]);
  }
  const modeByte = encodeMode(state.mode, state.region);
  return new Uint8Array([0x00, 0xd1, state.light ? 1 : 0, state.assist, modeByte, 0, 0, 0, 0, 0]);
}

function hasRecordId(bytes: Uint8Array, id: readonly [number, number]): boolean {
  return bytes.length >= 10 && bytes[0] === id[0] && bytes[1] === id[1];
}

// ---- Capability check ----

export function isBleSupported(): boolean {
  return isNativeBle() || (typeof navigator !== "undefined" && "bluetooth" in navigator);
}

// ---- BLE operations ----

const BLE_TIMEOUT = 5_000;
const SUPER73_NAME_PREFIXES = ["SUPER73", "S73", "super73", "s73"] as const;
const SELECTED_DEVICE_ID_KEY = "ecoride-super73-device-id";

// The step name lands in the diagnostic log, which is how we tell a bike that
// never answers service discovery from one that ignores a register read.
function withTimeout<T>(promise: Promise<T>, step?: string, ms = BLE_TIMEOUT): Promise<T> {
  const message = step ? `BLE timeout (${step})` : "BLE timeout";
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
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
  const device = isNativeBle()
    ? await nativeScan(isSuper73DeviceName)
    : await navigator.bluetooth.requestDevice({
        filters: SUPER73_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
        optionalServices: [METRICS_SERVICE, AUTH_SERVICE, DEVICE_INFO_SERVICE],
      });
  if (!device.gatt) throw new Error("GATT not available");
  await withTimeout(device.gatt.connect(), "connect");
  saveSelectedDeviceId(device);
  return device;
}

/**
 * Try to reconnect to a previously paired Super73 without showing the picker.
 * Uses navigator.bluetooth.getDevices() (Chrome 85+). Returns null if no
 * paired device is found or if the API is unavailable.
 */
export async function reconnectPairedDevice(): Promise<BluetoothDevice | null> {
  if (isNativeBle()) return reconnectNativeDevice();
  if (!navigator.bluetooth.getDevices) {
    bleLog("reconnect_skip", "getDevices unavailable");
    return null;
  }
  const devices = await navigator.bluetooth.getDevices();
  const preferredDeviceId = loadSelectedDeviceId();
  const preferredDevice = preferredDeviceId
    ? (devices.find((device) => device.id === preferredDeviceId) ?? null)
    : null;

  if (preferredDeviceId && !preferredDevice?.gatt) {
    bleLog("reconnect_skip", `saved device not permitted (${devices.length} permitted)`);
    return null;
  }

  const super73 = preferredDevice ?? devices.find((device) => isSuper73DeviceName(device.name));
  if (!super73?.gatt) {
    bleLog("reconnect_skip", `no Super73 among ${devices.length} permitted devices`);
    return null;
  }
  try {
    await withTimeout(super73.gatt.connect(), "connect");
    saveSelectedDeviceId(super73);
    return super73;
  } catch (e) {
    bleLog("reconnect_gatt_error", `${super73.name ?? "?"}: ${describeError(e)}`);
    return null;
  }
}

// Android connects by MAC address without a scan, so the saved id is enough.
async function reconnectNativeDevice(): Promise<BluetoothDevice | null> {
  const id = loadSelectedDeviceId();
  if (!id) {
    bleLog("reconnect_skip", "no saved native device");
    return null;
  }
  const device = await nativeDeviceById(id);
  try {
    await withTimeout(device.gatt!.connect(), "connect");
    return device;
  } catch (e) {
    bleLog("reconnect_gatt_error", `${device.name ?? id}: ${describeError(e)}`);
    return null;
  }
}

async function getCharacteristics(server: BluetoothRemoteGATTServer) {
  const service = await withTimeout(server.getPrimaryService(METRICS_SERVICE), "service");
  const [registerIdChar, registerChar] = await Promise.all([
    withTimeout(service.getCharacteristic(REGISTER_ID_CHAR), "characteristic"),
    withTimeout(service.getCharacteristic(REGISTER_CHAR), "characteristic"),
  ]);
  return { registerIdChar, registerChar };
}

// Web Bluetooth rejects overlapping GATT operations ("GATT operation already in
// progress") and rapid concurrent reads/writes can destabilize the link and drop
// the connection. Mode cycling, the EPAC notifier write, and the auto-mode effect
// can all issue operations at once, so every read/write is funneled through a single
// FIFO queue to guarantee only one GATT operation runs at a time.
let gattQueue: Promise<unknown> = Promise.resolve();

const HISTORY_RETRY_DELAYS_MS = [0, 10, 25, 75];

/**
 * Select a history record on 0x1564 and read it back from 0x155f. The result
 * characteristic keeps its previous value when the record is absent or the
 * select is still in flight, so the ID must match before the bytes are trusted.
 * Must run inside serializeGatt.
 */
async function readRecord(
  chars: {
    registerIdChar: BluetoothRemoteGATTCharacteristic;
    registerChar: BluetoothRemoteGATTCharacteristic;
  },
  id: readonly [number, number],
  step: string,
): Promise<Uint8Array | null> {
  await withTimeout(chars.registerIdChar.writeValue(new Uint8Array(id)), `${step} select`);
  for (const delay of HISTORY_RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const value = await withTimeout(chars.registerChar.readValue(), `${step} read`);
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    // ponytail: re-reading the same record can still return the previous copy;
    // superduper selects a different record (FCFC) first as a cache barrier.
    if (hasRecordId(bytes, id)) return bytes;
  }
  return null;
}

async function requireRecord(
  chars: Parameters<typeof readRecord>[0],
  id: readonly [number, number],
  step: string,
): Promise<Uint8Array> {
  const bytes = await readRecord(chars, id, step);
  if (!bytes) throw new Error(`Super73 record ${hexId(id)} unavailable (${step})`);
  return bytes;
}

function hexId(id: readonly number[]): string {
  return id.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Device Information Firmware Revision (0x2a26): open read, no pairing or app
 * auth. Read first on every connection, so a link that cannot carry any ATT
 * request (Chrome Android, 2026-11-15) fails here, before the handshake, and the
 * log says so. Null when unavailable (older Chrome grants lack the service).
 * Must run inside serializeGatt.
 */
async function readFirmwareRevision(server: BluetoothRemoteGATTServer): Promise<string | null> {
  try {
    const dis = await withTimeout(server.getPrimaryService(DEVICE_INFO_SERVICE), "dis service");
    const char = await withTimeout(
      dis.getCharacteristic(FIRMWARE_REVISION_CHAR),
      "dis characteristic",
    );
    const value = await withTimeout(char.readValue(), "dis firmware");
    const revision = new TextDecoder()
      .decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
      .replace(/\0/g, "")
      .trim();
    bleLog("dis_firmware", revision);
    return revision;
  } catch (e) {
    bleLog("dis_unavailable", describeError(e));
    return null;
  }
}

/**
 * Advertised name and firmware revision must agree when both are known
 * (superduper docs/ble_protocol.md); either one alone is enough. Otherwise
 * probe history records 00D9 (v2) then 0300 (v1) — reads only, so it also runs
 * on bikes without the auth service. Never probes by sending control frames.
 * Must run inside serializeGatt.
 */
async function detectProtocol(
  server: BluetoothRemoteGATTServer,
  firmware: string | null,
): Promise<Super73Protocol> {
  const byName = protocolFromName(server.device?.name);
  const byFirmware = firmware === null ? "unknown" : protocolFromFirmware(firmware);
  if (byName !== "unknown" && byFirmware !== "unknown" && byName !== byFirmware) {
    bleLog("protocol_mismatch", `name ${byName}, firmware ${byFirmware}`);
    return "unknown";
  }
  if (byName !== "unknown") return byName;
  if (byFirmware !== "unknown") return byFirmware;
  try {
    const chars = await getCharacteristics(server);
    if (await readRecord(chars, V2_MODE_RECORD, "probe v2")) return "v2";
    if (await readRecord(chars, V1_STATE_RECORD, "probe v1")) return "v1";
  } catch (e) {
    bleLog("protocol_probe_failed", describeError(e));
  }
  return "unknown";
}

function serializeGatt<T>(operation: () => Promise<T>): Promise<T> {
  // Chain onto the queue regardless of whether the previous op resolved or rejected,
  // so a single failed operation never wedges the queue for subsequent ones.
  const result = gattQueue.then(operation, operation);
  gattQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Super73 firmware ignores register commands until the client passes a
 * challenge/response handshake, on every connection: read a 20-byte challenge,
 * write SHA1(challenge + key), then read back the state byte (1 = accepted).
 * Without it the first register write never completes. Protocol from
 * https://github.com/blopker/superduper (docs/ble_protocol.md, issue #106).
 * Bikes that don't expose the service are left on the unauthenticated path.
 * Never skip the handshake because the state byte already reads 1: v1 firmware
 * (221122) leaves it set after a disconnect — observed on a real bike.
 */
export async function authenticate(server: BluetoothRemoteGATTServer): Promise<void> {
  return serializeGatt(async () => {
    const firmware = await readFirmwareRevision(server);
    let service: BluetoothRemoteGATTService;
    try {
      service = await withTimeout(server.getPrimaryService(AUTH_SERVICE), "auth service");
    } catch (e) {
      bleLog("auth_skip", describeError(e));
      await resolveProtocol(server, firmware);
      return;
    }
    const [challengeChar, responseChar, stateChar] = await Promise.all([
      withTimeout(service.getCharacteristic(AUTH_CHALLENGE_CHAR), "auth characteristic"),
      withTimeout(service.getCharacteristic(AUTH_RESPONSE_CHAR), "auth characteristic"),
      withTimeout(service.getCharacteristic(AUTH_STATE_CHAR), "auth characteristic"),
    ]);
    const challenge = await withTimeout(challengeChar.readValue(), "auth challenge");
    const payload = new Uint8Array(40);
    payload.set(new Uint8Array(challenge.buffer, challenge.byteOffset, 20));
    payload.set(AUTH_DEFAULT_KEY, 20);
    const response = await crypto.subtle.digest("SHA-1", payload);
    await withTimeout(responseChar.writeValue(response), "auth response");
    const state = await withTimeout(stateChar.readValue(), "auth state");
    if (state.getUint8(0) !== 1) {
      throw new Error(`Super73 authentication refused (state ${state.getUint8(0)})`);
    }
    bleLog("auth_ok");
    await resolveProtocol(server, firmware);
  });
}

async function resolveProtocol(server: BluetoothRemoteGATTServer, firmware: string | null) {
  const protocol = await detectProtocol(server, firmware);
  protocols.set(server, protocol);
  lastStates.delete(server);
  bleLog("protocol", protocol);
}

function requireKnownProtocol(server: BluetoothRemoteGATTServer): "v1" | "v2" {
  const protocol = getProtocol(server);
  if (protocol === "unknown") {
    throw new Error("Super73 protocol version unknown — refusing to send control commands");
  }
  return protocol;
}

export async function readState(
  server: BluetoothRemoteGATTServer,
  source = "poll",
): Promise<Super73State> {
  return serializeGatt(async () => {
    const protocol = requireKnownProtocol(server);
    const chars = await getCharacteristics(server);
    const state =
      protocol === "v2"
        ? parseV2State(
            await requireRecord(chars, V2_CONTROL_RECORD, "state"),
            await requireRecord(chars, V2_MODE_RECORD, "mode"),
          )
        : parseStateBytes(await requireRecord(chars, V1_STATE_RECORD, "state"), source);
    lastStates.set(server, state);
    return state;
  });
}

/**
 * @param isStillValid re-checked inside the GATT queue, immediately before the
 * bytes go out. Operations wait their turn here — behind a read, or behind a
 * write stuck on its timeout — so the caller's BLE session can end between
 * calling this and the write actually happening. Checking only at the call site
 * would let a command from a dropped session reach the bike, and reconnecting
 * reuses the same GATT server, so it could land on the next session.
 */
export async function writeState(
  server: BluetoothRemoteGATTServer,
  state: Super73State,
  isStillValid: () => boolean = () => true,
): Promise<void> {
  return serializeGatt(async () => {
    if (!isStillValid()) return;
    const protocol = requireKnownProtocol(server);
    const { registerChar } = await getCharacteristics(server);
    if (!isStillValid()) return;
    const command = buildWriteCommand(state, protocol);
    await withTimeout(registerChar.writeValue(command as unknown as BufferSource), "state write");
  });
}

export async function readRide(
  server: BluetoothRemoteGATTServer,
): Promise<{ rangeKm: number; batteryPercent: number } | null> {
  return serializeGatt(async () => {
    // ponytail: v2 range/SoC live in 00D1/00D0 — not decoded yet.
    if (getProtocol(server) !== "v1") return null;
    const chars = await getCharacteristics(server);
    const bytes = await readRecord(chars, V1_RIDE_RECORD, "ride");
    return bytes ? parseRidePacket(bytes) : null;
  });
}

/**
 * Parse a speed telemetry packet (byte[0]=0x02, byte[1]=0x01).
 * bytes[2-3] as little-endian uint16 / 100 = speed in km/h.
 * Returns null for non-speed packets.
 */
export function parseSpeedPacket(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0x02 || bytes[1] !== 0x01) return null;
  const raw = bytes[2]! | (bytes[3]! << 8);
  return raw / 100;
}

/**
 * Battery/range calibration. The bike reports a single raw byte (data[8] of the
 * RIDE frame). With BASE === REAL === 60 the raw byte maps 1:1 to km, matching
 * Walker73's defaults. Recalibrate REAL on a real bike if a model tops out elsewhere.
 */
export const SUPER73_BASE_MAX_RANGE = 60;
export const SUPER73_REAL_MAX_RANGE = 60;

/**
 * Parse a RIDE telemetry packet (byte[0]=0x02, byte[1]=0x03).
 * byte[8] = raw remaining range reported by the bike's computer.
 * Returns null for non-RIDE or truncated frames.
 */
export function parseRidePacket(
  bytes: Uint8Array,
): { rangeKm: number; batteryPercent: number } | null {
  if (bytes.length < 9 || bytes[0] !== 0x02 || bytes[1] !== 0x03) return null;
  const clamped = Math.min(Math.max(bytes[8]!, 0), SUPER73_BASE_MAX_RANGE);
  const ratio = clamped / SUPER73_BASE_MAX_RANGE;
  return {
    rangeKm: ratio * SUPER73_REAL_MAX_RANGE,
    batteryPercent: Math.round(ratio * 100),
  };
}

/**
 * Subscribe to state change notifications pushed by the bike.
 * Returns a cleanup function on success, or null if the firmware doesn't support it.
 *
 * The S73 notifier multiplexes packet types on a single characteristic:
 *   byte[0]=0x03 → state packet (mode/assist/light/region) — calls onState
 *   byte[0]=0x02, byte[1]=0x01 → speed telemetry (km/h)   — calls onSpeed
 *   byte[0]=0x02, byte[1]=0x03 → RIDE frame (range/battery) — calls onRide
 *   byte[0]=0x02 other / 0x04  → odometer / timer          — ignored
 */
export async function startStateNotifications(
  server: BluetoothRemoteGATTServer,
  onState: (state: Super73State) => void,
  onSpeed?: (speedKmh: number) => void,
  onRide?: (data: { rangeKm: number; batteryPercent: number }) => void,
): Promise<(() => void) | null> {
  try {
    // Through the queue like every other GATT operation: subscribing while a
    // read or write is in flight fails with "GATT operation already in progress".
    const char = await serializeGatt(async () => {
      const service = await withTimeout(
        server.getPrimaryService(METRICS_SERVICE),
        "notifier service",
      );
      const c = await withTimeout(
        service.getCharacteristic(REGISTER_NOTIFIER_CHAR),
        "notifier characteristic",
      );
      await withTimeout(c.startNotifications(), "notifier start");
      return c;
    });
    const listener = (event: Event) => {
      const c = event.target as BluetoothRemoteGATTCharacteristic;
      if (!c.value) return;
      const bytes = new Uint8Array(c.value.buffer, c.value.byteOffset, c.value.byteLength);
      if (getProtocol(server) === "v2") {
        const patched = applyV2Telemetry(lastStates.get(server), bytes);
        if (patched) {
          lastStates.set(server, patched);
          onState(patched);
        }
        return;
      }
      if (bytes[0] === 0x03) {
        try {
          onState(parseStateBytes(bytes, "notifier"));
        } catch {
          // malformed packet — skip
        }
      } else if (bytes[0] === 0x02 && bytes[1] === 0x03) {
        const ride = parseRidePacket(bytes);
        if (ride && onRide) onRide(ride);
      } else if (onSpeed) {
        const speedKmh = parseSpeedPacket(bytes);
        if (speedKmh !== null) onSpeed(speedKmh);
      }
    };
    char.addEventListener("characteristicvaluechanged", listener);
    return () => char.removeEventListener("characteristicvaluechanged", listener);
  } catch (e) {
    bleLog("notifier_unavailable", describeError(e));
    return null;
  }
}

/** Patch a known v2 state with a 00D0 or 00D9 telemetry record; null otherwise. */
export function applyV2Telemetry(
  current: Super73State | undefined,
  bytes: Uint8Array,
): Super73State | null {
  if (!current) return null;
  if (hasRecordId(bytes, V2_CONTROL_RECORD)) {
    return { ...current, assist: Math.min(Math.max(bytes[2]!, 0), 4), light: bytes[4] === 1 };
  }
  if (hasRecordId(bytes, V2_MODE_RECORD) && MODE_ORDER[bytes[5]!]) {
    return { ...current, mode: MODE_ORDER[bytes[5]!]! };
  }
  return null;
}
