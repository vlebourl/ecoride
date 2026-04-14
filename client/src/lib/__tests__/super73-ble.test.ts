import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseStateBytes,
  buildWriteCommand,
  decodeMode,
  encodeMode,
  modeIndex,
  isBleSupported,
  scanAndConnect,
  reconnectPairedDevice,
  readState,
  writeState,
  startStateNotifications,
  type Super73State,
} from "../super73-ble";

describe("decodeMode", () => {
  it("decodes EU modes (offset by 4)", () => {
    expect(decodeMode(4)).toEqual({ mode: "eco", region: "eu" });
    expect(decodeMode(5)).toEqual({ mode: "tour", region: "eu" });
    expect(decodeMode(6)).toEqual({ mode: "sport", region: "eu" });
    expect(decodeMode(7)).toEqual({ mode: "race", region: "eu" });
  });

  it("decodes US modes (no offset)", () => {
    expect(decodeMode(0)).toEqual({ mode: "eco", region: "us" });
    expect(decodeMode(1)).toEqual({ mode: "tour", region: "us" });
    expect(decodeMode(2)).toEqual({ mode: "sport", region: "us" });
    expect(decodeMode(3)).toEqual({ mode: "race", region: "us" });
  });

  it("falls back to eco for out-of-range values", () => {
    expect(decodeMode(8).mode).toBe("eco");
    expect(decodeMode(255).mode).toBe("eco");
  });
});

describe("encodeMode", () => {
  it("encodes EU modes with offset 4", () => {
    expect(encodeMode("eco", "eu")).toBe(4);
    expect(encodeMode("tour", "eu")).toBe(5);
    expect(encodeMode("sport", "eu")).toBe(6);
    expect(encodeMode("race", "eu")).toBe(7);
  });

  it("encodes US modes without offset", () => {
    expect(encodeMode("eco", "us")).toBe(0);
    expect(encodeMode("tour", "us")).toBe(1);
    expect(encodeMode("sport", "us")).toBe(2);
    expect(encodeMode("race", "us")).toBe(3);
  });

  it("roundtrips correctly for all modes and regions", () => {
    for (const region of ["eu", "us"] as const) {
      for (const mode of ["eco", "tour", "sport", "race"] as const) {
        const byte = encodeMode(mode, region);
        const decoded = decodeMode(byte);
        expect(decoded.mode).toBe(mode);
        expect(decoded.region).toBe(region);
      }
    }
  });
});

describe("modeIndex", () => {
  it("returns correct indices", () => {
    expect(modeIndex("eco")).toBe(0);
    expect(modeIndex("tour")).toBe(1);
    expect(modeIndex("sport")).toBe(2);
    expect(modeIndex("race")).toBe(3);
  });
});

describe("parseStateBytes", () => {
  it("parses EU state bytes correctly", () => {
    const bytes = new Uint8Array([3, 0, 2, 0, 1, 6, 0, 0, 0, 0]);
    const state = parseStateBytes(bytes);
    expect(state).toEqual({ mode: "sport", assist: 2, light: true, region: "eu" });
  });

  it("parses US state bytes correctly", () => {
    const bytes = new Uint8Array([3, 0, 4, 0, 0, 1, 0, 0, 0, 0]);
    const state = parseStateBytes(bytes);
    expect(state).toEqual({ mode: "tour", assist: 4, light: false, region: "us" });
  });

  it("clamps assist to 0-4 range", () => {
    const bytes = new Uint8Array([3, 0, 10, 0, 0, 4, 0, 0, 0, 0]);
    expect(parseStateBytes(bytes).assist).toBe(4);
  });

  it("throws on too-short buffer", () => {
    expect(() => parseStateBytes(new Uint8Array([3, 0]))).toThrow("Invalid state");
  });
});

describe("buildWriteCommand", () => {
  it("builds correct EU command", () => {
    const state: Super73State = { mode: "sport", assist: 3, light: true, region: "eu" };
    const cmd = buildWriteCommand(state);
    expect(Array.from(cmd)).toEqual([0, 209, 1, 3, 6, 0, 0, 0, 0, 0]);
  });

  it("builds correct US command", () => {
    const state: Super73State = { mode: "eco", assist: 0, light: false, region: "us" };
    const cmd = buildWriteCommand(state);
    expect(Array.from(cmd)).toEqual([0, 209, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("always has 10 bytes with header [0, 209]", () => {
    const state: Super73State = { mode: "race", assist: 4, light: true, region: "eu" };
    const cmd = buildWriteCommand(state);
    expect(cmd.length).toBe(10);
    expect(cmd[0]).toBe(0);
    expect(cmd[1]).toBe(209);
  });
});

// ---- BLE operations (mocked navigator.bluetooth) ----

function makeMockGATT(stateBytes: number[]) {
  const registerIdChar = { writeValue: vi.fn().mockResolvedValue(undefined) };
  const registerChar = {
    readValue: vi.fn().mockResolvedValue({
      buffer: new Uint8Array(stateBytes).buffer,
    }),
    writeValue: vi.fn().mockResolvedValue(undefined),
  };

  const service = {
    getCharacteristic: vi.fn().mockImplementation((uuid: string) => {
      if (uuid === "00001564-1212-efde-1523-785feabcd123") return Promise.resolve(registerIdChar);
      if (uuid === "0000155f-1212-efde-1523-785feabcd123") return Promise.resolve(registerChar);
      return Promise.reject(new Error("Unknown char"));
    }),
  };

  const server = {
    connected: true,
    getPrimaryService: vi.fn().mockResolvedValue(service),
  } as unknown as BluetoothRemoteGATTServer;

  return { server, registerIdChar, registerChar };
}

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

describe("isBleSupported", () => {
  const originalBluetooth = Object.getOwnPropertyDescriptor(navigator, "bluetooth");

  afterEach(() => {
    if (originalBluetooth) {
      Object.defineProperty(navigator, "bluetooth", originalBluetooth);
    } else {
      delete (navigator as Record<string, unknown>)["bluetooth"];
    }
  });

  it("returns true when navigator.bluetooth exists", () => {
    Object.defineProperty(navigator, "bluetooth", { value: {}, configurable: true });
    expect(isBleSupported()).toBe(true);
  });

  it("returns false when navigator.bluetooth is absent", () => {
    delete (navigator as Record<string, unknown>)["bluetooth"];
    expect(isBleSupported()).toBe(false);
  });
});

describe("scanAndConnect", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests device with correct filters, connects, and remembers the selected device", async () => {
    const gatt = { connect: vi.fn().mockResolvedValue(undefined) };
    const device = { id: "bike-123", gatt } as BluetoothDevice;
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: vi.fn().mockResolvedValue(device) },
      configurable: true,
    });

    const result = await scanAndConnect();
    expect(result).toBe(device);
    expect(navigator.bluetooth.requestDevice).toHaveBeenCalledWith({
      filters: [
        { namePrefix: "SUPER73" },
        { namePrefix: "S73" },
        { namePrefix: "super73" },
        { namePrefix: "s73" },
      ],
      optionalServices: ["00001554-1212-efde-1523-785feabcd123"],
    });
    expect(gatt.connect).toHaveBeenCalled();
    expect(localStorage.setItem).toHaveBeenCalledWith("ecoride-super73-device-id", "bike-123");
  });

  it("throws when GATT is not available", async () => {
    const device = { id: "bike-123", gatt: null };
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: vi.fn().mockResolvedValue(device) },
      configurable: true,
    });

    await expect(scanAndConnect()).rejects.toThrow("GATT not available");
  });
});

describe("reconnectPairedDevice", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null when getDevices is not available", async () => {
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: vi.fn() },
      configurable: true,
    });
    const result = await reconnectPairedDevice();
    expect(result).toBeNull();
  });

  it("reconnects to the stored preferred device id", async () => {
    const storedGatt = { connect: vi.fn().mockResolvedValue(undefined) };
    const otherGatt = { connect: vi.fn().mockResolvedValue(undefined) };
    localStorage.setItem("ecoride-super73-device-id", "bike-123");

    const preferredDevice = { id: "bike-123", name: "Custom bike label", gatt: storedGatt };
    const otherDevice = { id: "bike-999", name: "SUPER73-RX", gatt: otherGatt };
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([otherDevice, preferredDevice]) },
      configurable: true,
    });

    const result = await reconnectPairedDevice();

    expect(result).toBe(preferredDevice);
    expect(storedGatt.connect).toHaveBeenCalled();
    expect(otherGatt.connect).not.toHaveBeenCalled();
  });

  it("returns null when the stored preferred device is no longer available", async () => {
    localStorage.setItem("ecoride-super73-device-id", "bike-123");
    const otherDevice = { id: "bike-999", name: "SUPER73-RX", gatt: { connect: vi.fn() } };
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([otherDevice]) },
      configurable: true,
    });

    const result = await reconnectPairedDevice();

    expect(result).toBeNull();
    expect(otherDevice.gatt.connect).not.toHaveBeenCalled();
  });

  it("reconnects to a previously paired Super73 device when no preferred id is stored", async () => {
    const gatt = { connect: vi.fn().mockResolvedValue(undefined) };
    const device = { id: "bike-123", name: "SUPER73-RX", gatt };
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([device]) },
      configurable: true,
    });

    const result = await reconnectPairedDevice();
    expect(result).toBe(device);
    expect(gatt.connect).toHaveBeenCalled();
    expect(localStorage.setItem).toHaveBeenCalledWith("ecoride-super73-device-id", "bike-123");
  });

  it("reconnects to a previously paired lowercase s73 device", async () => {
    const gatt = { connect: vi.fn().mockResolvedValue(undefined) };
    const device = { id: "bike-123", name: "s73 adventure series", gatt };
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([device]) },
      configurable: true,
    });

    const result = await reconnectPairedDevice();

    expect(result).toBe(device);
    expect(gatt.connect).toHaveBeenCalled();
  });

  it("returns null when no Super73 is among paired devices", async () => {
    const otherDevice = { id: "other-1", name: "SomeOtherDevice", gatt: { connect: vi.fn() } };
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([otherDevice]) },
      configurable: true,
    });

    const result = await reconnectPairedDevice();
    expect(result).toBeNull();
  });

  it("returns null when connect fails (device out of range)", async () => {
    const gatt = { connect: vi.fn().mockRejectedValue(new Error("connection failed")) };
    const device = { id: "bike-123", name: "S73 FTEX", gatt };
    Object.defineProperty(navigator, "bluetooth", {
      value: { getDevices: vi.fn().mockResolvedValue([device]) },
      configurable: true,
    });

    const result = await reconnectPairedDevice();
    expect(result).toBeNull();
  });
});

describe("readState", () => {
  it("writes request then reads and parses state", async () => {
    // EU sport, assist 2, light on
    const { server, registerIdChar, registerChar } = makeMockGATT([3, 0, 2, 0, 1, 6, 0, 0, 0, 0]);

    const state = await readState(server);

    expect(registerIdChar.writeValue).toHaveBeenCalledWith(new Uint8Array([3, 0]));
    expect(registerChar.readValue).toHaveBeenCalled();
    expect(state).toEqual({ mode: "sport", assist: 2, light: true, region: "eu" });
  });
});

describe("startStateNotifications", () => {
  function makeNotifierGATT(notifierChar: object) {
    const service = {
      getCharacteristic: vi.fn().mockImplementation((uuid: string) => {
        if (uuid === "0000155e-1212-efde-1523-785feabcd123") return Promise.resolve(notifierChar);
        return Promise.reject(new Error("Unknown char"));
      }),
    };
    return {
      connected: true,
      getPrimaryService: vi.fn().mockResolvedValue(service),
    } as unknown as BluetoothRemoteGATTServer;
  }

  function makeNotifierChar() {
    const listeners: Record<string, EventListener> = {};
    return {
      startNotifications: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event] = cb;
      }),
      removeEventListener: vi.fn(),
      emit(bytes: number[]) {
        const value = new DataView(new Uint8Array(bytes).buffer);
        const target = { value } as unknown as BluetoothRemoteGATTCharacteristic;
        listeners["characteristicvaluechanged"]?.({ target } as Event);
      },
    };
  }

  it("calls handler for state packets (byte[0]=0x03)", async () => {
    const char = makeNotifierChar();
    const server = makeNotifierGATT(char);
    const handler = vi.fn();

    await startStateNotifications(server, handler);
    // EU EPAC, assist=4, light=ON
    char.emit([0x03, 0x00, 0x04, 0x00, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00]);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ mode: "eco", assist: 4, light: true, region: "eu" });
  });

  it("ignores telemetry packets (byte[0]=0x02)", async () => {
    const char = makeNotifierChar();
    const server = makeNotifierGATT(char);
    const handler = vi.fn();

    await startStateNotifications(server, handler);
    char.emit([0x02, 0x01, 0x2e, 0x0e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // speed packet
    char.emit([0x02, 0x03, 0x00, 0x00, 0x68, 0xbe, 0x0b, 0x00, 0x19, 0x00]); // odometer packet

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores timer packets (byte[0]=0x04)", async () => {
    const char = makeNotifierChar();
    const server = makeNotifierGATT(char);
    const handler = vi.fn();

    await startStateNotifications(server, handler);
    char.emit([0x04, 0x01, 0x10, 0xb9, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    expect(handler).not.toHaveBeenCalled();
  });

  it("returns null when notifier characteristic is unavailable", async () => {
    const service = {
      getCharacteristic: vi.fn().mockRejectedValue(new Error("not found")),
    };
    const server = {
      connected: true,
      getPrimaryService: vi.fn().mockResolvedValue(service),
    } as unknown as BluetoothRemoteGATTServer;

    const result = await startStateNotifications(server, vi.fn());
    expect(result).toBeNull();
  });
});

describe("writeState", () => {
  it("builds command and writes to register", async () => {
    const { server, registerChar } = makeMockGATT([3, 0, 0, 0, 0, 4, 0, 0, 0, 0]);
    const state: Super73State = { mode: "race", assist: 4, light: true, region: "eu" };

    await writeState(server, state);

    expect(registerChar.writeValue).toHaveBeenCalled();
    const written = registerChar.writeValue.mock.calls[0][0];
    // Should be [0, 209, 1, 4, 7, 0, 0, 0, 0, 0]
    expect(Array.from(new Uint8Array(written.buffer ?? written))).toEqual([
      0, 209, 1, 4, 7, 0, 0, 0, 0, 0,
    ]);
  });
});
