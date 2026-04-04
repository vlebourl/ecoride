import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseStateBytes,
  buildWriteCommand,
  decodeMode,
  encodeMode,
  modeIndex,
  isBleSupported,
  scanAndConnect,
  readState,
  writeState,
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests device with correct filters and connects", async () => {
    const gatt = { connect: vi.fn().mockResolvedValue(undefined) };
    const device = { gatt };
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: vi.fn().mockResolvedValue(device) },
      configurable: true,
    });

    const result = await scanAndConnect();
    expect(result).toBe(device);
    expect(navigator.bluetooth.requestDevice).toHaveBeenCalledWith({
      filters: [{ namePrefix: "SUPER73" }, { namePrefix: "S73" }],
      optionalServices: ["00001554-1212-efde-1523-785feabcd123"],
    });
    expect(gatt.connect).toHaveBeenCalled();
  });

  it("throws when GATT is not available", async () => {
    const device = { gatt: null };
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: vi.fn().mockResolvedValue(device) },
      configurable: true,
    });

    await expect(scanAndConnect()).rejects.toThrow("GATT not available");
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
