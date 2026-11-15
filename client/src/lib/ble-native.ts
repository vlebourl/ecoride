// Native BLE transport for the Capacitor Android app.
//
// Exposes the slice of the Web Bluetooth API that super73-ble.ts uses
// (device.gatt → getPrimaryService → getCharacteristic → readValue / writeValue /
// startNotifications, plus `gattserverdisconnected`) on top of
// @capacitor-community/bluetooth-le. The Super73 protocol therefore stays in one
// place and runs unchanged over either transport.
//
// The plugin is loaded lazily, only inside the native app, so the PWA bundle
// does not grow.

import type { BleCharacteristic, BleClient, BleService } from "@capacitor-community/bluetooth-le";
import { bleLog, describeError } from "@/lib/ble-log";

type BleClientApi = typeof BleClient;

const OPERATION_TIMEOUT_MS = 5_000;
const SCAN_TIMEOUT_MS = 10_000;
const BOND_TIMEOUT_MS = 20_000;
// The Super73 often ignores the first connection requests: Android gets "LE
// Connection Complete", then HCI 0x3E (connection failed to be established)
// ~100 ms later, reported as GATT status 147/133. Observed on 2026-11-15 for
// both ecoRide and superduper on the same Pixel; superduper got through on its
// 3rd attempt because it retries. Delays between attempts:
const CONNECT_RETRY_DELAYS_MS = [1_000, 2_000, 3_000, 5_000];
// Encryption probe: the history selector (0x1564) is readable, needs an
// encrypted link, and reading it has no side effect on the bike.
const METRICS_SERVICE = "00001554-1212-efde-1523-785feabcd123";
const ENCRYPTED_PROBE_CHAR = "00001564-1212-efde-1523-785feabcd123";

interface Super73BondPlugin {
  removeBond(options: { deviceId: string }): Promise<{ removed: boolean }>;
}

let bondPluginPromise: Promise<Super73BondPlugin> | null = null;

// Local plugin in android/app (Super73BondPlugin.java): Android hides removeBond().
function bondPlugin(): Promise<Super73BondPlugin> {
  bondPluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) =>
    registerPlugin<Super73BondPlugin>("Super73Bond"),
  );
  return bondPluginPromise;
}

/** True inside the Capacitor native shell (Capacitor injects window.Capacitor). */
export function isNativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

let clientPromise: Promise<BleClientApi> | null = null;

function bleClient(): Promise<BleClientApi> {
  clientPromise ??= import("@capacitor-community/bluetooth-le").then(async ({ BleClient }) => {
    // neverForLocation: scan results are not used to derive location (the
    // manifest declares BLUETOOTH_SCAN with the matching flag).
    await BleClient.initialize({ androidNeverForLocation: true });
    return BleClient;
  });
  return clientPromise;
}

function asView(value: BufferSource): DataView {
  if (value instanceof DataView) return value;
  if (ArrayBuffer.isView(value))
    return new DataView(value.buffer, value.byteOffset, value.byteLength);
  return new DataView(value);
}

class NativeCharacteristic extends EventTarget {
  value: DataView | undefined;

  constructor(
    private readonly server: NativeGattServer,
    private readonly serviceUuid: string,
    private readonly meta: BleCharacteristic,
  ) {
    super();
  }

  get uuid() {
    return this.meta.uuid;
  }

  get properties() {
    return this.meta.properties;
  }

  async readValue(): Promise<DataView> {
    const ble = await bleClient();
    this.value = await ble.read(this.server.device.id, this.serviceUuid, this.meta.uuid, {
      timeout: OPERATION_TIMEOUT_MS,
    });
    return this.value;
  }

  async writeValue(value: BufferSource): Promise<void> {
    const ble = await bleClient();
    const { write, writeWithoutResponse } = this.meta.properties;
    const args = [
      this.server.device.id,
      this.serviceUuid,
      this.meta.uuid,
      asView(value),
      { timeout: OPERATION_TIMEOUT_MS },
    ] as const;
    // Same rule as superduper: acknowledged write unless only "without response" is offered.
    if (!write && writeWithoutResponse) await ble.writeWithoutResponse(...args);
    else await ble.write(...args);
  }

  async startNotifications(): Promise<this> {
    const ble = await bleClient();
    await ble.startNotifications(
      this.server.device.id,
      this.serviceUuid,
      this.meta.uuid,
      (value) => {
        this.value = value;
        this.dispatchEvent(new Event("characteristicvaluechanged"));
      },
    );
    return this;
  }

  async stopNotifications(): Promise<this> {
    const ble = await bleClient();
    await ble.stopNotifications(this.server.device.id, this.serviceUuid, this.meta.uuid);
    return this;
  }
}

class NativeService {
  constructor(
    private readonly server: NativeGattServer,
    private readonly meta: BleService,
  ) {}

  get uuid() {
    return this.meta.uuid;
  }

  async getCharacteristic(uuid: string): Promise<NativeCharacteristic> {
    const meta = this.meta.characteristics.find((c) => c.uuid.toLowerCase() === uuid.toLowerCase());
    if (!meta) throw new DOMException(`No characteristic ${uuid}`, "NotFoundError");
    return new NativeCharacteristic(this.server, this.meta.uuid, meta);
  }
}

class NativeGattServer {
  connected = false;
  private services: BleService[] = [];
  // Drops caused by our own bond recovery must not reach the app as a disconnect.
  private connecting = false;

  constructor(readonly device: NativeDevice) {}

  /**
   * Connect, make sure the link is bonded and actually encrypts, and recover
   * once from a stale bond. The bike's custom services require encryption
   * (Security Mode 1 Level 2), so a bond-less connection cannot control it.
   * A bike that forgot this phone (paired elsewhere since, reset) rejects the
   * key Android still holds: drop that bond, reconnect, pair again.
   */
  async connect(): Promise<this> {
    const ble = await bleClient();
    this.connecting = true;
    try {
      await this.open(ble);
      if (!(await this.bondedAndEncrypted(ble))) {
        bleLog("bond_stale", this.device.id);
        await (await bondPlugin()).removeBond({ deviceId: this.device.id });
        await ble.disconnect(this.device.id).catch(() => undefined);
        await this.open(ble);
        if (!(await this.bondedAndEncrypted(ble))) {
          throw new Error(
            "Super73 refused pairing — forget the bike in Android Bluetooth settings, then retry",
          );
        }
        bleLog("bond_recovered", this.device.id);
      }
    } catch (e) {
      await ble.disconnect(this.device.id).catch(() => undefined);
      throw e;
    } finally {
      this.connecting = false;
    }
    this.connected = true;
    return this;
  }

  private async open(ble: BleClientApi): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.openOnce(ble);
        return;
      } catch (e) {
        const delay = CONNECT_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) throw e;
        bleLog("connect_retry", `attempt ${attempt + 1}: ${describeError(e)}`);
        await ble.disconnect(this.device.id).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async openOnce(ble: BleClientApi): Promise<void> {
    await ble.connect(
      this.device.id,
      () => {
        this.connected = false;
        if (!this.connecting) this.device.dispatchEvent(new Event("gattserverdisconnected"));
      },
      { timeout: OPERATION_TIMEOUT_MS },
    );
    this.services = await ble.getServices(this.device.id);
  }

  private async bondedAndEncrypted(ble: BleClientApi): Promise<boolean> {
    // Bikes without the metrics service have nothing encrypted to check.
    if (!this.services.some((s) => s.uuid.toLowerCase() === METRICS_SERVICE)) return true;
    try {
      if (!(await ble.isBonded(this.device.id))) {
        await ble.createBond(this.device.id, { timeout: BOND_TIMEOUT_MS });
      }
      await ble.read(this.device.id, METRICS_SERVICE, ENCRYPTED_PROBE_CHAR, {
        timeout: OPERATION_TIMEOUT_MS,
      });
      return true;
    } catch (e) {
      bleLog("bond_probe_failed", describeError(e));
      return false;
    }
  }

  disconnect(): void {
    this.connected = false;
    void bleClient().then((ble) => ble.disconnect(this.device.id));
  }

  async getPrimaryService(uuid: string): Promise<NativeService> {
    const meta = this.services.find((s) => s.uuid.toLowerCase() === uuid.toLowerCase());
    if (!meta) throw new DOMException(`No service ${uuid}`, "NotFoundError");
    return new NativeService(this, meta);
  }
}

class NativeDevice extends EventTarget {
  readonly gatt: NativeGattServer;

  constructor(
    readonly id: string,
    readonly name: string | undefined,
  ) {
    super();
    this.gatt = new NativeGattServer(this);
  }
}

// ponytail: one cast at the boundary. The shim implements only what
// super73-ble.ts and useSuper73.ts touch; widen it if they start using more.
function asWebDevice(device: NativeDevice): BluetoothDevice {
  return device as unknown as BluetoothDevice;
}

/**
 * Scan until the first advertiser whose name matches, then return it (not yet
 * connected). Auto-picks instead of showing a chooser: there is one bike.
 */
export async function nativeScan(
  matches: (name: string | undefined) => boolean,
  timeoutMs = SCAN_TIMEOUT_MS,
): Promise<BluetoothDevice> {
  const ble = await bleClient();
  const found = await new Promise<NativeDevice>((resolve, reject) => {
    const timer = setTimeout(() => {
      void ble.stopLEScan();
      reject(new Error("No Super73 found nearby"));
    }, timeoutMs);
    ble
      .requestLEScan({}, (result) => {
        const name = result.localName ?? result.device.name;
        if (!matches(name)) return;
        clearTimeout(timer);
        void ble.stopLEScan();
        resolve(new NativeDevice(result.device.deviceId, name));
      })
      .catch((e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
  });
  return asWebDevice(found);
}

/** A previously selected bike, by its Android MAC address. Not yet connected. */
export async function nativeDeviceById(id: string): Promise<BluetoothDevice> {
  const ble = await bleClient();
  const [known] = await ble.getDevices([id]).catch(() => []);
  return asWebDevice(new NativeDevice(id, known?.name));
}
