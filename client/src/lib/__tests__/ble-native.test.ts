import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake @capacitor-community/bluetooth-le: a v1 Super73 with the history mechanism.
const METRICS = "00001554-1212-efde-1523-785feabcd123";
const SELECTOR = "00001564-1212-efde-1523-785feabcd123";
const RESULT = "0000155f-1212-efde-1523-785feabcd123";
const TX = "0000155e-1212-efde-1523-785feabcd123";

const props = (
  p: Partial<Record<"read" | "write" | "writeWithoutResponse" | "notify", boolean>>,
) => ({
  broadcast: false,
  read: false,
  write: false,
  writeWithoutResponse: false,
  notify: false,
  indicate: false,
  authenticatedSignedWrites: false,
  ...p,
});

const ble = vi.hoisted(() => ({
  state: {
    result: new Uint8Array(10),
    onDisconnect: null as null | (() => void),
    notify: null as null | ((v: DataView) => void),
  },
  initialize: vi.fn(async () => undefined),
  connect: vi.fn(),
  getServices: vi.fn(),
  getDevices: vi.fn(async (ids: string[]) =>
    ids.map((deviceId) => ({ deviceId, name: "SUPER73" })),
  ),
  read: vi.fn(),
  write: vi.fn(),
  writeWithoutResponse: vi.fn(async () => undefined),
  startNotifications: vi.fn(),
  stopNotifications: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  isBonded: vi.fn(async () => true),
  createBond: vi.fn(async () => undefined),
  removeBond: vi.fn(async () => ({ removed: true })),
  requestLEScan: vi.fn(),
  stopLEScan: vi.fn(async () => undefined),
}));
vi.mock("@capacitor-community/bluetooth-le", () => ({ BleClient: ble }));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({ removeBond: ble.removeBond }) }));

import { nativeDeviceById, nativeScan } from "../ble-native";
import { authenticate, isBleSupported, readState, writeState } from "../super73-ble";

const V1_STATE = [0x03, 0x00, 2, 0, 1, 6, 0, 0, 0, 0];

beforeEach(() => {
  (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
  ble.connect.mockImplementation(async (_id: string, onDisconnect: () => void) => {
    ble.state.onDisconnect = onDisconnect;
  });
  ble.getServices.mockResolvedValue([
    {
      uuid: METRICS,
      characteristics: [
        { uuid: SELECTOR, properties: props({ read: true, write: true }), descriptors: [] },
        { uuid: RESULT, properties: props({ read: true, write: true }), descriptors: [] },
        { uuid: TX, properties: props({ read: true, notify: true }), descriptors: [] },
      ],
    },
  ]);
  ble.write.mockImplementation(async (_id: string, _s: string, c: string, v: DataView) => {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (c === SELECTOR && bytes[0] === 0x03 && bytes[1] === 0x00)
      ble.state.result = new Uint8Array(V1_STATE);
  });
  ble.read.mockImplementation(async (_id: string, _s: string, c: string) =>
    c === RESULT ? new DataView(ble.state.result.buffer) : new DataView(new ArrayBuffer(0)),
  );
  ble.startNotifications.mockImplementation(
    async (_i: string, _s: string, _c: string, cb: (v: DataView) => void) => {
      ble.state.notify = cb;
    },
  );
});

afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
  vi.clearAllMocks();
});

describe("native BLE transport", () => {
  it("reports BLE as supported inside the native shell even without navigator.bluetooth", () => {
    expect(isBleSupported()).toBe(true);
  });

  it("runs the unchanged Super73 protocol over the plugin (v1 read + 00D1 write)", async () => {
    const device = await nativeDeviceById("AA:BB:CC:DD:EE:FF");
    await device.gatt!.connect();
    expect(device.gatt!.connected).toBe(true);
    // No auth service exposed by this fake: authenticate() skips it and the
    // advertised name "SUPER73" still identifies protocol v1.
    await authenticate(device.gatt!);

    expect(await readState(device.gatt!)).toEqual({
      mode: "sport",
      assist: 2,
      light: true,
      region: "eu",
    });
    await writeState(device.gatt!, { mode: "race", assist: 4, light: true, region: "eu" });
    const control = ble.write.mock.calls.find((c) => c[2] === RESULT)!;
    expect(Array.from(new Uint8Array((control[3] as DataView).buffer))).toEqual([
      0x00, 0xd1, 1, 4, 7, 1, 0, 0, 0, 0,
    ]);
  });

  it("uses an acknowledged write when the characteristic offers it", async () => {
    const device = await nativeDeviceById("AA");
    await device.gatt!.connect();
    const service = await device.gatt!.getPrimaryService(METRICS);
    await (await service.getCharacteristic(RESULT)).writeValue(new Uint8Array(10));
    expect(ble.write).toHaveBeenCalled();
    expect(ble.writeWithoutResponse).not.toHaveBeenCalled();
  });

  it("forwards notifications as characteristicvaluechanged and drops as gattserverdisconnected", async () => {
    const device = await nativeDeviceById("AA");
    await device.gatt!.connect();
    const char = await (await device.gatt!.getPrimaryService(METRICS)).getCharacteristic(TX);
    const onValue = vi.fn();
    char.addEventListener("characteristicvaluechanged", onValue);
    await char.startNotifications();
    ble.state.notify!(new DataView(new Uint8Array(V1_STATE).buffer));
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(Array.from(new Uint8Array(char.value!.buffer))).toEqual(V1_STATE);

    const onDrop = vi.fn();
    device.addEventListener("gattserverdisconnected", onDrop);
    ble.state.onDisconnect!();
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(device.gatt!.connected).toBe(false);
  });

  it("rejects unknown services like Web Bluetooth (NotFoundError)", async () => {
    const device = await nativeDeviceById("AA");
    await device.gatt!.connect();
    await expect(
      device.gatt!.getPrimaryService("0000180a-0000-1000-8000-00805f9b34fb"),
    ).rejects.toThrow(/No service/);
  });

  it("scan auto-picks the first advertiser whose name matches", async () => {
    ble.requestLEScan.mockImplementation(async (_o: unknown, cb: (r: unknown) => void) => {
      cb({ device: { deviceId: "11" }, localName: "Pixel Buds" });
      cb({ device: { deviceId: "22" }, localName: "SUPER73" });
    });
    const device = await nativeScan((name) => name === "SUPER73");
    expect(device.id).toBe("22");
    expect(device.name).toBe("SUPER73");
    expect(ble.stopLEScan).toHaveBeenCalled();
  });
});

describe("native bonding", () => {
  it("pairs a bike that is not bonded yet before using it", async () => {
    ble.isBonded.mockResolvedValueOnce(false);
    const device = await nativeDeviceById("AA");
    await device.gatt!.connect();
    expect(ble.createBond).toHaveBeenCalledWith("AA", expect.anything());
    expect(ble.removeBond).not.toHaveBeenCalled();
  });

  it("drops a stale bond the bike no longer accepts, re-pairs, and reports no disconnect", async () => {
    // Old key: Android says bonded, but the encrypted probe read fails once.
    ble.read.mockRejectedValueOnce(new Error("Reading characteristic failed."));
    ble.isBonded.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const device = await nativeDeviceById("AA");
    const onDrop = vi.fn();
    device.addEventListener("gattserverdisconnected", onDrop);
    ble.disconnect.mockImplementation(async () => ble.state.onDisconnect?.());

    await device.gatt!.connect();

    expect(ble.removeBond).toHaveBeenCalledWith({ deviceId: "AA" });
    expect(ble.connect).toHaveBeenCalledTimes(2);
    expect(ble.createBond).toHaveBeenCalledTimes(1);
    expect(device.gatt!.connected).toBe(true);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("gives up after one recovery and leaves the link closed", async () => {
    ble.read.mockRejectedValue(new Error("Reading characteristic failed."));
    const device = await nativeDeviceById("AA");
    await expect(device.gatt!.connect()).rejects.toThrow(/refused pairing/);
    expect(ble.removeBond).toHaveBeenCalledTimes(1);
    expect(device.gatt!.connected).toBe(false);
    expect(ble.disconnect).toHaveBeenCalled();
  });
});

describe("native connection retries", () => {
  afterEach(() => vi.useRealTimers());

  it("retries a connection the bike drops while it is being established (0x3E → status 147)", async () => {
    vi.useFakeTimers();
    ble.connect
      .mockRejectedValueOnce(new Error("Connection failed with status 147 (unnamed)."))
      .mockRejectedValueOnce(new Error("Connection failed with status 133 (GATT_ERROR)."));
    const device = await nativeDeviceById("AA");
    const connecting = device.gatt!.connect();
    await vi.advanceTimersByTimeAsync(10_000);
    await connecting;
    expect(ble.connect).toHaveBeenCalledTimes(3);
    expect(device.gatt!.connected).toBe(true);
  });

  it("gives up after the last retry with the platform error", async () => {
    vi.useFakeTimers();
    ble.connect.mockRejectedValue(new Error("Connection failed with status 147 (unnamed)."));
    const device = await nativeDeviceById("AA");
    const connecting = device.gatt!.connect().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(String(await connecting)).toMatch(/status 147/);
    expect(ble.connect).toHaveBeenCalledTimes(5);
    expect(device.gatt!.connected).toBe(false);
  });
});

// Regression (2026-11-15): the hook's 5 s connect timeout abandoned a native
// attempt that was still retrying and started a second one on the same bike.
// The two raced, and the encryption probe failing with "Not connected" was
// taken for a stale bond: removeBond on a valid pairing.
describe("native reconnection races", () => {
  it("joins the attempt already running for the same bike instead of opening a second one", async () => {
    let finish!: () => void;
    ble.connect.mockImplementationOnce(
      (_id: string, onDisconnect: () => void) =>
        new Promise<void>((resolve) => {
          ble.state.onDisconnect = onDisconnect;
          finish = resolve;
        }),
    );
    const first = await nativeDeviceById("RACE");
    const second = await nativeDeviceById("RACE");
    expect(second).toBe(first);

    const a = first.gatt!.connect();
    const b = second.gatt!.connect();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    finish();
    await Promise.all([a, b]);
    expect(ble.connect).toHaveBeenCalledTimes(1);
  });

  it("never drops the bond when the link died during the encryption probe", async () => {
    ble.read.mockImplementationOnce(async () => {
      ble.state.onDisconnect?.();
      throw new Error("Not connected to device.");
    });
    const device = await nativeDeviceById("DROP");
    await expect(device.gatt!.connect()).rejects.toThrow(/dropped the connection/);
    expect(ble.removeBond).not.toHaveBeenCalled();
  });
});
