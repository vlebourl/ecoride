import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseCscMeasurement,
  computeCscSpeed,
  isBleSpeedSensorSupported,
  scanAndConnectSpeedSensor,
  reconnectPairedSpeedSensor,
  subscribeSpeedSensor,
  clearSelectedDeviceId,
  type CscSample,
} from "../ble-speed-sensor";

// Helper: build a DataView for CSC Measurement bytes
function makeDataView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

// Helper: build a CSC Measurement with wheel data
// flags=0x01 (wheel only), wheelRevs (uint32 LE), wheelEventTime (uint16 LE)
function wheelOnlyPayload(wheelRevs: number, wheelEventTime: number): number[] {
  const buf = new Uint8Array(7);
  buf[0] = 0x01; // flags: wheel data present
  // uint32 LE wheel revs
  buf[1] = (wheelRevs >>> 0) & 0xff;
  buf[2] = (wheelRevs >>> 8) & 0xff;
  buf[3] = (wheelRevs >>> 16) & 0xff;
  buf[4] = (wheelRevs >>> 24) & 0xff;
  // uint16 LE wheel event time
  buf[5] = wheelEventTime & 0xff;
  buf[6] = (wheelEventTime >>> 8) & 0xff;
  return Array.from(buf);
}

// Helper: CSC Measurement with wheel + crank data
function wheelAndCrankPayload(
  wheelRevs: number,
  wheelEventTime: number,
  crankRevs: number,
  crankEventTime: number,
): number[] {
  const buf = new Uint8Array(11);
  buf[0] = 0x03; // flags: wheel + crank
  buf[1] = (wheelRevs >>> 0) & 0xff;
  buf[2] = (wheelRevs >>> 8) & 0xff;
  buf[3] = (wheelRevs >>> 16) & 0xff;
  buf[4] = (wheelRevs >>> 24) & 0xff;
  buf[5] = wheelEventTime & 0xff;
  buf[6] = (wheelEventTime >>> 8) & 0xff;
  buf[7] = crankRevs & 0xff;
  buf[8] = (crankRevs >>> 8) & 0xff;
  buf[9] = crankEventTime & 0xff;
  buf[10] = (crankEventTime >>> 8) & 0xff;
  return Array.from(buf);
}

describe("parseCscMeasurement", () => {
  it("returns null for empty buffer", () => {
    expect(parseCscMeasurement(makeDataView([]))).toBeNull();
  });

  it("returns null when wheel flag is not set (crank only)", () => {
    // flags = 0x02 (only crank bit set)
    const payload = [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(parseCscMeasurement(makeDataView(payload))).toBeNull();
  });

  it("returns null when wheel flag set but buffer too short", () => {
    const payload = [0x01, 0, 0]; // only 3 bytes, need at least 7
    expect(parseCscMeasurement(makeDataView(payload))).toBeNull();
  });

  it("parses wheel-only frame", () => {
    const dv = makeDataView(wheelOnlyPayload(100, 2048));
    const sample = parseCscMeasurement(dv);
    expect(sample).not.toBeNull();
    expect(sample!.wheelRevs).toBe(100);
    expect(sample!.wheelEventTime).toBe(2048);
    expect(sample!.crankRevs).toBeNull();
    expect(sample!.crankEventTime).toBeNull();
  });

  it("parses wheel + crank frame", () => {
    const dv = makeDataView(wheelAndCrankPayload(200, 4096, 50, 1024));
    const sample = parseCscMeasurement(dv);
    expect(sample).not.toBeNull();
    expect(sample!.wheelRevs).toBe(200);
    expect(sample!.wheelEventTime).toBe(4096);
    expect(sample!.crankRevs).toBe(50);
    expect(sample!.crankEventTime).toBe(1024);
  });
});

describe("computeCscSpeed", () => {
  const WHEEL_MM = 2215; // Super73 27.5×2.4

  it("computes speed for 1 rev/s = 2.215 m/s = 7.974 km/h", () => {
    const prev: CscSample = {
      wheelRevs: 0,
      wheelEventTime: 0,
      crankRevs: null,
      crankEventTime: null,
    };
    const curr: CscSample = {
      wheelRevs: 1,
      wheelEventTime: 1024,
      crankRevs: null,
      crankEventTime: null,
    };
    const result = computeCscSpeed(prev, curr, WHEEL_MM);
    // 1 rev × 2215 mm = 2.215 m in 1 s → 7.974 km/h
    expect(result.speedKmh).toBeCloseTo(7.974, 2);
    expect(result.cadenceRpm).toBeNull();
  });

  it("returns speedKmh=0 when Δtime is 0", () => {
    const prev: CscSample = {
      wheelRevs: 10,
      wheelEventTime: 500,
      crankRevs: null,
      crankEventTime: null,
    };
    const curr: CscSample = {
      wheelRevs: 12,
      wheelEventTime: 500,
      crankRevs: null,
      crankEventTime: null,
    };
    const result = computeCscSpeed(prev, curr, WHEEL_MM);
    expect(result.speedKmh).toBe(0);
  });

  it("returns speedKmh=0 when Δrev is 0 (stationary)", () => {
    const prev: CscSample = {
      wheelRevs: 10,
      wheelEventTime: 500,
      crankRevs: null,
      crankEventTime: null,
    };
    const curr: CscSample = {
      wheelRevs: 10,
      wheelEventTime: 600,
      crankRevs: null,
      crankEventTime: null,
    };
    const result = computeCscSpeed(prev, curr, WHEEL_MM);
    expect(result.speedKmh).toBe(0);
  });

  it("handles 16-bit timestamp wraparound", () => {
    // t1=65000, t2=100 → Δtime = (100 - 65000 + 65536) % 65536 = 636 ticks = 0.621 s
    const prev: CscSample = {
      wheelRevs: 0,
      wheelEventTime: 65000,
      crankRevs: null,
      crankEventTime: null,
    };
    const curr: CscSample = {
      wheelRevs: 1,
      wheelEventTime: 100,
      crankRevs: null,
      crankEventTime: null,
    };
    const result = computeCscSpeed(prev, curr, WHEEL_MM);
    // 2.215 m / 0.6211 s → 12.842 km/h
    const deltaTimeSec = 636 / 1024;
    const expected = (2215 / 1_000_000 / deltaTimeSec) * 3600;
    expect(result.speedKmh).toBeCloseTo(expected, 1);
  });

  it("computes cadence from crank data", () => {
    // Δcrank = 1 rev, Δtime = 1024 ticks (1 s) → 60 rpm
    const prev: CscSample = { wheelRevs: 0, wheelEventTime: 0, crankRevs: 0, crankEventTime: 0 };
    const curr: CscSample = {
      wheelRevs: 1,
      wheelEventTime: 1024,
      crankRevs: 1,
      crankEventTime: 1024,
    };
    const result = computeCscSpeed(prev, curr, WHEEL_MM);
    expect(result.cadenceRpm).toBeCloseTo(60, 0);
  });

  it("returns cadenceRpm=null when crank data missing", () => {
    const prev: CscSample = {
      wheelRevs: 0,
      wheelEventTime: 0,
      crankRevs: null,
      crankEventTime: null,
    };
    const curr: CscSample = {
      wheelRevs: 2,
      wheelEventTime: 2048,
      crankRevs: null,
      crankEventTime: null,
    };
    expect(computeCscSpeed(prev, curr, WHEEL_MM).cadenceRpm).toBeNull();
  });

  it("scales with wheel circumference", () => {
    const WHEEL_MM_700C = 2096;
    const prev: CscSample = {
      wheelRevs: 0,
      wheelEventTime: 0,
      crankRevs: null,
      crankEventTime: null,
    };
    const curr: CscSample = {
      wheelRevs: 1,
      wheelEventTime: 1024,
      crankRevs: null,
      crankEventTime: null,
    };
    const result = computeCscSpeed(prev, curr, WHEEL_MM_700C);
    // 2.096 m/s × 3.6 = 7.546 km/h
    expect(result.speedKmh).toBeCloseTo(7.546, 1);
  });
});

// ---- BLE operations (mocked navigator.bluetooth) ----

function makeLocalStorageStub() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const k in store) delete store[k];
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
}

describe("isBleSpeedSensorSupported", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "bluetooth");

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(navigator, "bluetooth", originalDescriptor);
    } else {
      delete (navigator as Record<string, unknown>)["bluetooth"];
    }
  });

  it("returns true when navigator.bluetooth exists", () => {
    Object.defineProperty(navigator, "bluetooth", { value: {}, configurable: true });
    expect(isBleSpeedSensorSupported()).toBe(true);
  });

  it("returns false when navigator.bluetooth is absent", () => {
    delete (navigator as Record<string, unknown>)["bluetooth"];
    expect(isBleSpeedSensorSupported()).toBe(false);
  });
});

describe("clearSelectedDeviceId", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes the stored device id from localStorage", () => {
    localStorage.setItem("ecoride-ble-speed-device-id", "sensor-001");
    clearSelectedDeviceId();
    expect(localStorage.removeItem).toHaveBeenCalledWith("ecoride-ble-speed-device-id");
  });
});

describe("scanAndConnectSpeedSensor", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests device with CSC service filter, connects, and saves device id", async () => {
    const gatt = { connect: vi.fn().mockResolvedValue(undefined) };
    const device = { id: "sensor-001", gatt } as BluetoothDevice;
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: vi.fn().mockResolvedValue(device) },
      configurable: true,
    });

    const result = await scanAndConnectSpeedSensor();

    expect(result).toBe(device);
    expect(navigator.bluetooth.requestDevice).toHaveBeenCalledWith({
      filters: [{ services: [0x1816] }],
    });
    expect(gatt.connect).toHaveBeenCalled();
    expect(localStorage.setItem).toHaveBeenCalledWith("ecoride-ble-speed-device-id", "sensor-001");
  });

  it("throws when GATT is not available", async () => {
    const device = { id: "sensor-001", gatt: null };
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: vi.fn().mockResolvedValue(device) },
      configurable: true,
    });

    await expect(scanAndConnectSpeedSensor()).rejects.toThrow("GATT not available");
  });
});

describe("reconnectPairedSpeedSensor", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null when getDevices is unavailable", async () => {
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: vi.fn() },
      configurable: true,
    });
    expect(await reconnectPairedSpeedSensor()).toBeNull();
  });

  it("reconnects to the stored preferred device id", async () => {
    const gatt = { connect: vi.fn().mockResolvedValue(undefined) };
    const device = { id: "sensor-001", name: "XOSS Speed", gatt };
    localStorage.setItem("ecoride-ble-speed-device-id", "sensor-001");
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([device]) },
      configurable: true,
    });

    const result = await reconnectPairedSpeedSensor();
    expect(result).toBe(device);
    expect(gatt.connect).toHaveBeenCalled();
  });

  it("returns null when no preferred device found and no fallback", async () => {
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([]) },
      configurable: true,
    });
    expect(await reconnectPairedSpeedSensor()).toBeNull();
  });

  it("returns null when preferred device id is not in paired list", async () => {
    localStorage.setItem("ecoride-ble-speed-device-id", "sensor-999");
    const other = { id: "sensor-001", name: "Other", gatt: { connect: vi.fn() } };
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([other]) },
      configurable: true,
    });

    expect(await reconnectPairedSpeedSensor()).toBeNull();
    expect(other.gatt.connect).not.toHaveBeenCalled();
  });

  it("returns null when connect fails (device out of range)", async () => {
    const gatt = { connect: vi.fn().mockRejectedValue(new Error("connection failed")) };
    const device = { id: "sensor-001", name: "Wahoo Speed", gatt };
    localStorage.setItem("ecoride-ble-speed-device-id", "sensor-001");
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([device]) },
      configurable: true,
    });

    expect(await reconnectPairedSpeedSensor()).toBeNull();
  });
});

describe("subscribeSpeedSensor", () => {
  it("starts notifications and calls onSample with computed speed", async () => {
    const wheelMm = 2215;
    const onSample = vi.fn();

    let notifyHandler: ((e: Event) => void) | null = null;
    const char = {
      addEventListener: vi.fn((_: string, h: (e: Event) => void) => {
        notifyHandler = h;
      }),
      removeEventListener: vi.fn(),
      startNotifications: vi.fn().mockResolvedValue(undefined),
      stopNotifications: vi.fn().mockResolvedValue(undefined),
    };
    const service = { getCharacteristic: vi.fn().mockResolvedValue(char) };
    const server = {
      getPrimaryService: vi.fn().mockResolvedValue(service),
    } as unknown as BluetoothRemoteGATTServer;

    const unsub = await subscribeSpeedSensor(server, onSample, wheelMm);

    // First notification: establishes prevSample, no output
    const payload1 = new DataView(new Uint8Array(wheelOnlyPayload(0, 0)).buffer);
    notifyHandler!({ target: { value: payload1 } } as unknown as Event);
    expect(onSample).not.toHaveBeenCalled();

    // Second notification: 1 rev in 1024 ticks (1 s) → ~7.974 km/h
    const payload2 = new DataView(new Uint8Array(wheelOnlyPayload(1, 1024)).buffer);
    notifyHandler!({ target: { value: payload2 } } as unknown as Event);
    expect(onSample).toHaveBeenCalledOnce();
    expect(onSample.mock.calls[0][0].speedKmh).toBeCloseTo(7.974, 1);

    // Unsubscribe cleans up
    unsub();
    expect(char.removeEventListener).toHaveBeenCalled();
  });
});
