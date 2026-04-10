import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { BleSpeedSensorProvider, useBleSpeedSensor } from "../useBleSpeedSensor";

// ---- Mocks ----

const scanAndConnectMock = vi.fn();
const reconnectPairedMock = vi.fn();
const subscribeSpeedMock = vi.fn();
const clearSelectedMock = vi.fn();

vi.mock("@/lib/ble-speed-sensor", () => ({
  isBleSpeedSensorSupported: () => true,
  scanAndConnectSpeedSensor: (...args: unknown[]) => scanAndConnectMock(...args),
  reconnectPairedSpeedSensor: (...args: unknown[]) => reconnectPairedMock(...args),
  subscribeSpeedSensor: (...args: unknown[]) => subscribeSpeedMock(...args),
  clearSelectedDeviceId: () => clearSelectedMock(),
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

function buildDevice(name = "TestSensor"): BluetoothDevice {
  return {
    id: "sensor-001",
    name,
    gatt: {
      connected: true,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as BluetoothDevice;
}

// Consumer component that exposes state via data attributes for querying
function Consumer() {
  const sensor = useBleSpeedSensor();
  return (
    <div>
      <span data-testid="status">{sensor.state.status}</span>
      <span data-testid="speed">{sensor.state.speedKmh ?? "null"}</span>
      <span data-testid="cadence">{sensor.state.cadenceRpm ?? "null"}</span>
      <span data-testid="device">{sensor.state.deviceName ?? "null"}</span>
      <button data-testid="pair" onClick={() => sensor.pair()}>
        Pair
      </button>
      <button data-testid="disconnect" onClick={() => sensor.disconnect()}>
        Disconnect
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <BleSpeedSensorProvider>
      <Consumer />
    </BleSpeedSensorProvider>,
  );
}

describe("BleSpeedSensorProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
    // Default: no paired device on mount
    reconnectPairedMock.mockResolvedValue(null);
    // Default unsubscribe function
    subscribeSpeedMock.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts disconnected", async () => {
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("disconnected");
    });
  });

  it("pair() goes to connected and shows device name", async () => {
    const device = buildDevice("MyCscSensor");
    scanAndConnectMock.mockResolvedValue(device);

    renderWithProvider();

    await act(async () => {
      screen.getByTestId("pair").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("connected");
      expect(screen.getByTestId("device").textContent).toBe("MyCscSensor");
    });
  });

  it("pair() emits speed via onSample callback", async () => {
    const device = buildDevice();
    scanAndConnectMock.mockResolvedValue(device);

    let capturedOnSample: ((r: { speedKmh: number; cadenceRpm: number | null }) => void) | null =
      null;

    subscribeSpeedMock.mockImplementation(
      (
        _server: unknown,
        onSample: (r: { speedKmh: number; cadenceRpm: number | null }) => void,
      ) => {
        capturedOnSample = onSample;
        return Promise.resolve(() => {});
      },
    );

    renderWithProvider();

    await act(async () => {
      screen.getByTestId("pair").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("connected");
    });

    // Simulate an incoming speed sample
    await act(async () => {
      capturedOnSample!({ speedKmh: 25.4, cadenceRpm: null });
    });

    expect(screen.getByTestId("speed").textContent).toBe("25.4");
  });

  it("gattserverdisconnected clears speed and goes to disconnected", async () => {
    const device = buildDevice();
    const listeners: Record<string, EventListener> = {};
    device.addEventListener = vi.fn((event: string, listener: EventListener) => {
      listeners[event] = listener;
    });
    device.removeEventListener = vi.fn();

    let capturedOnSample: ((r: { speedKmh: number; cadenceRpm: number | null }) => void) | null =
      null;

    scanAndConnectMock.mockResolvedValue(device);
    subscribeSpeedMock.mockImplementation(
      (
        _server: unknown,
        onSample: (r: { speedKmh: number; cadenceRpm: number | null }) => void,
      ) => {
        capturedOnSample = onSample;
        return Promise.resolve(() => {});
      },
    );

    renderWithProvider();

    await act(async () => {
      screen.getByTestId("pair").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("connected");
    });

    // Inject a speed reading
    await act(async () => {
      capturedOnSample!({ speedKmh: 18, cadenceRpm: null });
    });

    expect(screen.getByTestId("speed").textContent).toBe("18");

    // Simulate disconnect event
    await act(async () => {
      listeners["gattserverdisconnected"]?.(new Event("gattserverdisconnected"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("speed").textContent).toBe("null");
    });
  });

  it("disconnect() clears device and goes to disconnected", async () => {
    const device = buildDevice();
    scanAndConnectMock.mockResolvedValue(device);

    renderWithProvider();

    await act(async () => {
      screen.getByTestId("pair").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("connected");
    });

    await act(async () => {
      screen.getByTestId("disconnect").click();
    });

    expect(screen.getByTestId("status").textContent).toBe("disconnected");
    expect(screen.getByTestId("device").textContent).toBe("null");
    expect(clearSelectedMock).toHaveBeenCalled();
  });

  it("pair() cancelled by user stays disconnected", async () => {
    scanAndConnectMock.mockRejectedValue(new Error("User cancelled the requestDevice() chooser"));

    renderWithProvider();

    await act(async () => {
      screen.getByTestId("pair").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("disconnected");
    });
  });
});
