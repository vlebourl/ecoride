import { describe, expect, it, vi } from "vitest";
import {
  applyV2Telemetry,
  authenticate,
  buildWriteCommand,
  getProtocol,
  loadSavedProtocol,
  protocolFromFirmware,
  protocolFromName,
  readOdometer,
  readRide,
  readSpeed,
  readState,
  startStateNotifications,
  writeState,
  type Super73State,
} from "../super73-ble";

// Protocol v1 (display 221122) vs v2 (250426), per superduper docs/ble_protocol.md.

const METRICS = "00001554-1212-efde-1523-785feabcd123";
const SELECTOR = "00001564-1212-efde-1523-785feabcd123";
const RESULT = "0000155f-1212-efde-1523-785feabcd123";
const AUTH = "00002554-1212-efde-1523-785feabcd123";
const DIS = "0000180a-0000-1000-8000-00805f9b34fb";

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const toBytes = (v: BufferSource) =>
  Array.from(
    v instanceof ArrayBuffer
      ? new Uint8Array(v)
      : new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
  );

/**
 * A fake display that implements the history mechanism: writing an ID to 0x1564
 * copies the matching record into 0x155f; an absent ID leaves 0x155f unchanged.
 */
function fakeBike(opts: {
  name?: string;
  firmware?: string;
  noAuth?: boolean;
  records: Record<string, number[]>;
}) {
  let result = new Uint8Array(10).fill(0xee);
  const controlWrites: number[][] = [];
  let notifierListener: EventListener | undefined;
  const chars: Record<string, object> = {
    "0000155e-1212-efde-1523-785feabcd123": {
      startNotifications: async () => undefined,
      addEventListener: (_event: string, cb: EventListener) => {
        notifierListener = cb;
      },
      removeEventListener: () => undefined,
    },
    [SELECTOR]: {
      writeValue: vi.fn(async (v: BufferSource) => {
        const id = toBytes(v)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const record = opts.records[id];
        if (record) result = new Uint8Array(record);
      }),
    },
    [RESULT]: {
      readValue: vi.fn(async () => view(result)),
      writeValue: vi.fn(async (v: BufferSource) => {
        controlWrites.push(toBytes(v));
      }),
    },
    "00002556-1212-efde-1523-785feabcd123": { readValue: async () => view(new Uint8Array(20)) },
    "00002557-1212-efde-1523-785feabcd123": { writeValue: async () => undefined },
    "00002558-1212-efde-1523-785feabcd123": { readValue: async () => view(new Uint8Array([1])) },
    "00002a26-0000-1000-8000-00805f9b34fb": {
      readValue: async () => {
        if (!opts.firmware) throw new Error("GATT read timeout");
        return view(new TextEncoder().encode(opts.firmware));
      },
    },
  };
  const service = {
    getCharacteristic: async (uuid: string) => {
      if (!chars[uuid]) throw new Error(`no characteristic ${uuid}`);
      return chars[uuid];
    },
  };
  const server = {
    connected: true,
    device: { name: opts.name },
    getPrimaryService: vi.fn(async (uuid: string) => {
      const services = opts.noAuth ? [METRICS] : [METRICS, AUTH, DIS];
      if (!services.includes(uuid)) throw new Error(`no service ${uuid}`);
      return service;
    }),
  } as unknown as BluetoothRemoteGATTServer;
  const notify = (bytes: number[]) =>
    notifierListener?.({ target: { value: view(new Uint8Array(bytes)) } } as unknown as Event);
  return { server, controlWrites, notify };
}

// EU sport, assist 2, light on.
const V1_STATE = [0x03, 0x00, 2, 0, 1, 6, 0, 0, 0, 0];
// assist 3, lights on / ride preset 2.
const V2_D0 = [0x00, 0xd0, 3, 0, 1, 80, 0, 0, 0, 0];
const V2_D9 = [0x00, 0xd9, 0x10, 0x0c, 1, 2, 0, 0, 0, 0];
const STATE: Super73State = { mode: "sport", assist: 3, light: true, region: "eu" };

describe("protocol identification", () => {
  it("maps the documented advertised names and firmware builds, nothing else", () => {
    expect(protocolFromName("SUPER73")).toBe("v1");
    expect(protocolFromName("S73 FTEX")).toBe("v2");
    expect(protocolFromName("S73-1234")).toBe("unknown");
    expect(protocolFromFirmware("221122")).toBe("v1");
    expect(protocolFromFirmware("250426\0")).toBe("v2");
    // Newer build: unknown, not "v2 by numeric ordering".
    expect(protocolFromFirmware("260101")).toBe("unknown");
  });

  it("falls back to Device Information when the name is not conclusive", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    const { server } = fakeBike({ name: "S73", firmware: "250426", records: {} });
    await authenticate(server);
    expect(getProtocol(server)).toBe("v2");
    // Persisted for the background sync plan, built while the bike is off.
    expect(loadSavedProtocol()).toBe("v2");
    vi.unstubAllGlobals();
  });

  it("falls back to the authenticated 00D9 / 0300 probe when Device Information fails", async () => {
    const v2 = fakeBike({ records: { "00d9": V2_D9, "0300": V1_STATE } });
    await authenticate(v2.server);
    expect(getProtocol(v2.server)).toBe("v2");

    const v1 = fakeBike({ records: { "0300": V1_STATE } });
    await authenticate(v1.server);
    expect(getProtocol(v1.server)).toBe("v1");
  });
});

it("identifies a v1 bike without the auth service by its 0300 record (PWA compat)", async () => {
  const { server, controlWrites } = fakeBike({
    name: "SUPER73-E2E",
    noAuth: true,
    records: { "0300": V1_STATE },
  });
  await authenticate(server);
  expect(getProtocol(server)).toBe("v1");
  await writeState(server, STATE);
  expect(controlWrites).toHaveLength(1);
});

it("refuses to identify a bike whose name and firmware disagree", async () => {
  const { server, controlWrites } = fakeBike({ name: "SUPER73", firmware: "250426", records: {} });
  await authenticate(server);
  expect(getProtocol(server)).toBe("unknown");
  await expect(writeState(server, STATE)).rejects.toThrow(/unknown/);
  expect(controlWrites).toEqual([]);
});

it("reads Device Information before the auth handshake", async () => {
  const { server } = fakeBike({ name: "SUPER73", firmware: "221122", records: {} });
  await authenticate(server);
  const services = (server.getPrimaryService as ReturnType<typeof vi.fn>).mock.calls.map(
    (c) => c[0],
  );
  expect(services.indexOf(DIS)).toBeLessThan(services.indexOf(AUTH));
});

describe("v1 bike (SUPER73 / 221122)", () => {
  it("reads state from record 0300 and writes an 00D1 control frame", async () => {
    const { server, controlWrites } = fakeBike({ name: "SUPER73", records: { "0300": V1_STATE } });
    await authenticate(server);

    expect(await readState(server)).toEqual({
      mode: "sport",
      assist: 2,
      light: true,
      region: "eu",
    });
    await writeState(server, STATE);
    expect(controlWrites).toEqual([[0x00, 0xd1, 1, 3, 6, 1, 0, 0, 0, 0]]);
  });

  it("rejects a stale 0x155f value instead of decoding it as state", async () => {
    // Record 0300 absent: 0x155f keeps its previous contents (here 0xEE…).
    const { server } = fakeBike({ name: "SUPER73", records: {} });
    await authenticate(server);
    await expect(readState(server)).rejects.toThrow(/0300/);
  });
});

describe("v2 bike (S73 FTEX / 250426)", () => {
  it("reads state from 00D0 + 00D9 and writes an 00C1 control frame", async () => {
    const { server, controlWrites } = fakeBike({
      name: "S73 FTEX",
      records: { "00d0": V2_D0, "00d9": V2_D9 },
    });
    await authenticate(server);

    expect(await readState(server)).toEqual({
      mode: "sport",
      assist: 3,
      light: true,
      region: "us",
    });
    await writeState(server, STATE);
    // Doc example: 00 c1 01 03 02 → lights on, assist 3, ride mode 2.
    expect(controlWrites).toEqual([[0x00, 0xc1, 1, 3, 2, 1, 0, 0, 0, 0]]);
  });

  it("patches the known state from 00D0 / 00D9 telemetry and ignores 00D1 (speed)", () => {
    const base: Super73State = { mode: "eco", assist: 0, light: false, region: "us" };
    expect(applyV2Telemetry(base, new Uint8Array(V2_D0))).toEqual({
      ...base,
      assist: 3,
      light: true,
    });
    expect(applyV2Telemetry(base, new Uint8Array(V2_D9))).toEqual({ ...base, mode: "sport" });
    expect(
      applyV2Telemetry(base, new Uint8Array([0x00, 0xd1, 0x10, 0, 0, 0, 0, 0, 0, 0])),
    ).toBeNull();
    expect(applyV2Telemetry(undefined, new Uint8Array(V2_D0))).toBeNull();
  });
});

// The v2 odometer is not decoded: no value is better than a guessed one.
it("reads no odometer from a v2 bike, even one that answers 0202", async () => {
  const { server } = fakeBike({
    name: "S73 FTEX",
    records: {
      "00d0": [0x00, 0xd0, 3, 0, 1, 80, 0x47, 0x35, 0, 0],
      "00d9": V2_D9,
      "0202": [0x02, 0x02, 0, 0, 0, 0, 0x47, 0x35, 0, 0],
    },
  });
  await authenticate(server);
  expect(getProtocol(server)).toBe("v2");
  expect(await readOdometer(server)).toBeNull();
});

describe("unidentified bike", () => {
  it("gets no odometer, read or notified", async () => {
    const frame = [0x02, 0x02, 0, 0x42, 0, 0, 0x47, 0x35, 0, 0];
    const { server, notify } = fakeBike({
      name: "SUPER73",
      firmware: "250426", // disagrees with the name
      records: { "0202": frame },
    });
    await authenticate(server);
    expect(getProtocol(server)).toBe("unknown");
    expect(await readOdometer(server)).toBeNull();

    const onOdometer = vi.fn();
    await startStateNotifications(server, vi.fn(), vi.fn(), vi.fn(), onOdometer);
    notify(frame);
    expect(onOdometer).not.toHaveBeenCalled();
  });

  it("sends no control command", async () => {
    const { server, controlWrites } = fakeBike({ name: "S73", records: {} });
    await authenticate(server);
    expect(getProtocol(server)).toBe("unknown");
    await expect(writeState(server, STATE)).rejects.toThrow(/unknown/);
    expect(controlWrites).toEqual([]);
  });
});

it("buildWriteCommand defaults to the v1 frame", () => {
  expect(Array.from(buildWriteCommand(STATE))).toEqual([0x00, 0xd1, 1, 3, 6, 1, 0, 0, 0, 0]);
});

// Captured from a real bike on 2026-11-15 (Chrome macOS, display firmware 221122,
// hardware v3.2.0): auth state already 01 before the handshake (v1 disconnect
// bug), handshake accepted, 00D0/00D9 absent from history.
describe("real v1 bike captures", () => {
  const hexBytes = (h: string) => h.match(/../g)!.map((b) => parseInt(b, 16));
  const CAPTURED = {
    "0300": hexBytes("0300045a010400000000"),
    "0203": hexBytes("02030000000000002e00"),
    "0202": hexBytes("0202003b00005dce0000"),
    "0201": hexBytes("02010000000000000000"),
  };

  it("decodes state and range from the captured records", async () => {
    const { server } = fakeBike({ name: "SUPER73", records: CAPTURED });
    await authenticate(server);
    expect(getProtocol(server)).toBe("v1");
    expect(await readState(server)).toEqual({ mode: "eco", assist: 4, light: true, region: "eu" });
    expect(await readRide(server)).toEqual({ rangeKm: 46, batteryPercent: 77 });
    // 0201 captured on the same bike, stationary: 0 km/h.
    expect(await readSpeed(server)).toBe(0);
  });

  it("reads the odometer through the history selector", async () => {
    const { server } = fakeBike({
      name: "SUPER73",
      // The frame checked against the bike's display: 13 639 x 100 m.
      records: { ...CAPTURED, "0202": hexBytes("02020042000047350000") },
    });
    await authenticate(server);
    expect(await readOdometer(server)).toBe(1363.9);
  });

  it("returns no odometer when the bike has no 0202 record", async () => {
    const { server } = fakeBike({ name: "SUPER73", records: { "0300": CAPTURED["0300"] } });
    await authenticate(server);
    expect(await readOdometer(server)).toBeNull();
  });

  it("identifies v1 from firmware 221122 when the name is not conclusive", async () => {
    const { server } = fakeBike({ name: "S73", firmware: "221122", records: CAPTURED });
    await authenticate(server);
    expect(getProtocol(server)).toBe("v1");
  });

  it("identifies v1 by probe: 00D9 absent (register unchanged), 0300 present", async () => {
    const { server } = fakeBike({ records: CAPTURED });
    await authenticate(server);
    expect(getProtocol(server)).toBe("v1");
  });
});
