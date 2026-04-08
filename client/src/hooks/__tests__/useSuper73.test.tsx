import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  Super73Provider,
  useSuper73,
  buildStateFromPreferences,
  resolveAutoModeZone,
  resolveAutoSuper73Mode,
} from "../useSuper73";
import type { Super73State } from "@/lib/super73-ble";

const scanAndConnectMock = vi.fn();
const reconnectPairedDeviceMock = vi.fn();
const readStateMock = vi.fn();
const writeStateMock = vi.fn();

vi.mock("@/lib/super73-ble", () => ({
  isBleSupported: () => true,
  scanAndConnect: (...args: unknown[]) => scanAndConnectMock(...args),
  reconnectPairedDevice: (...args: unknown[]) => reconnectPairedDeviceMock(...args),
  readState: (...args: unknown[]) => readStateMock(...args),
  writeState: (...args: unknown[]) => writeStateMock(...args),
}));

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

function Consumer({ label }: { label: string }) {
  const ble = useSuper73();
  return (
    <div>
      <button onClick={() => ble.connect()}>{label} connect</button>
      <span>
        {label}:{ble.status}
      </span>
      <span>
        {label}-mode:{ble.bikeState?.mode ?? "none"}
      </span>
      <span>
        {label}-assist:{ble.bikeState?.assist ?? "none"}
      </span>
      <span>
        {label}-light:{ble.bikeState?.light ? "on" : "off"}
      </span>
    </div>
  );
}

function buildDevice(): BluetoothDevice {
  return {
    gatt: {
      connected: true,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as BluetoothDevice;
}

const baseState: Super73State = {
  mode: "tour",
  assist: 2,
  light: false,
  region: "eu",
};

describe("useSuper73 helpers", () => {
  it("builds a preferred state only when preferences differ", () => {
    expect(
      buildStateFromPreferences(baseState, {
        autoModeEnabled: false,
        defaultMode: null,
        defaultAssist: null,
        defaultLight: null,
      }),
    ).toBeNull();

    expect(
      buildStateFromPreferences(baseState, {
        autoModeEnabled: false,
        defaultMode: "race",
        defaultAssist: 4,
        defaultLight: true,
      }),
    ).toEqual({
      ...baseState,
      mode: "race",
      assist: 4,
      light: true,
    });
  });

  it("resolves auto mode zones and target modes with hysteresis bands", () => {
    expect(resolveAutoModeZone(8)).toBe("low");
    expect(resolveAutoModeZone(15)).toBeNull();
    expect(resolveAutoModeZone(24)).toBe("high");
    expect(resolveAutoSuper73Mode("low")).toBe("race");
    expect(resolveAutoSuper73Mode("high")).toBe("eco");
    expect(resolveAutoSuper73Mode(null)).toBeNull();
  });
});

describe("useSuper73 provider", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
    reconnectPairedDeviceMock.mockResolvedValue(null);
    readStateMock.mockResolvedValue(baseState);
    writeStateMock.mockResolvedValue(undefined);
    scanAndConnectMock.mockResolvedValue(buildDevice());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shares a single BLE session across multiple consumers", async () => {
    render(
      <Super73Provider enabled>
        <Consumer label="trip" />
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("trip connect"));

    await waitFor(() => {
      expect(screen.getByText("trip:connected")).toBeTruthy();
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
      expect(screen.getByText("trip-mode:tour")).toBeTruthy();
      expect(screen.getByText("vehicle-mode:tour")).toBeTruthy();
    });

    expect(scanAndConnectMock).toHaveBeenCalledTimes(1);
  });

  it("applies default mode, assist and light at connection time in one write", async () => {
    render(
      <Super73Provider
        enabled
        preferences={{
          autoModeEnabled: false,
          defaultMode: "race",
          defaultAssist: 4,
          defaultLight: true,
        }}
      >
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));

    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledWith(expect.anything(), {
        mode: "race",
        assist: 4,
        light: true,
        region: "eu",
      });
      expect(screen.getByText("vehicle-mode:race")).toBeTruthy();
      expect(screen.getByText("vehicle-assist:4")).toBeTruthy();
      expect(screen.getByText("vehicle-light:on")).toBeTruthy();
    });
  });

  it("switches automatically to off-road then back to eco when speed crosses thresholds", async () => {
    const { rerender } = render(
      <Super73Provider
        enabled
        preferences={{
          autoModeEnabled: true,
          defaultMode: null,
          defaultAssist: null,
          defaultLight: null,
        }}
        tracking={{ isTracking: false, speedKmh: null }}
      >
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));

    await waitFor(() => {
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });

    writeStateMock.mockClear();
    readStateMock.mockResolvedValue(baseState);

    rerender(
      <Super73Provider
        enabled
        preferences={{
          autoModeEnabled: true,
          defaultMode: null,
          defaultAssist: null,
          defaultLight: null,
        }}
        tracking={{ isTracking: true, speedKmh: 8 }}
      >
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledWith(expect.anything(), {
        ...baseState,
        mode: "race",
      });
    });

    writeStateMock.mockClear();
    readStateMock.mockResolvedValue({ ...baseState, mode: "race" });

    rerender(
      <Super73Provider
        enabled
        preferences={{
          autoModeEnabled: true,
          defaultMode: null,
          defaultAssist: null,
          defaultLight: null,
        }}
        tracking={{ isTracking: true, speedKmh: 24 }}
      >
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledWith(expect.anything(), {
        ...baseState,
        mode: "eco",
      });
    });
  });
});
