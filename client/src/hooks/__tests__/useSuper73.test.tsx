import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  Super73Provider,
  useSuper73,
  buildStateFromPreferences,
  deriveTripModeSelection,
  resolveAutoModeZone,
  resolveAutoSuper73Mode,
  shouldTriggerEpac,
  ASSIST_EPAC_TRIGGER,
} from "../useSuper73";
import type { Super73State } from "@/lib/super73-ble";

const scanAndConnectMock = vi.fn();
const reconnectPairedDeviceMock = vi.fn();
const readStateMock = vi.fn();
const writeStateMock = vi.fn();
// Simulates notifier unavailable by default (returns null = firmware doesn't support it).
const startStateNotificationsMock = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/super73-ble", () => ({
  isBleSupported: () => true,
  scanAndConnect: (...args: unknown[]) => scanAndConnectMock(...args),
  reconnectPairedDevice: (...args: unknown[]) => reconnectPairedDeviceMock(...args),
  readState: (...args: unknown[]) => readStateMock(...args),
  writeState: (...args: unknown[]) => writeStateMock(...args),
  startStateNotifications: (...args: unknown[]) => startStateNotificationsMock(...args),
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
      <span>
        {label}-poll-warning:{ble.epacPollFallbackWarning ? "yes" : "no"}
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

describe("shouldTriggerEpac", () => {
  it("returns true when assist is ASSIST_EPAC_TRIGGER and mode is not eco", () => {
    expect(
      shouldTriggerEpac({ mode: "race", assist: ASSIST_EPAC_TRIGGER, light: false, region: "eu" }),
    ).toBe(true);
    expect(
      shouldTriggerEpac({ mode: "sport", assist: ASSIST_EPAC_TRIGGER, light: false, region: "eu" }),
    ).toBe(true);
    expect(
      shouldTriggerEpac({ mode: "tour", assist: ASSIST_EPAC_TRIGGER, light: false, region: "eu" }),
    ).toBe(true);
  });

  it("returns false when mode is already eco", () => {
    expect(
      shouldTriggerEpac({ mode: "eco", assist: ASSIST_EPAC_TRIGGER, light: false, region: "eu" }),
    ).toBe(false);
  });

  it("returns false when assist is not the trigger level", () => {
    expect(shouldTriggerEpac({ mode: "race", assist: 0, light: false, region: "eu" })).toBe(false);
    expect(shouldTriggerEpac({ mode: "race", assist: 1, light: false, region: "eu" })).toBe(false);
    expect(shouldTriggerEpac({ mode: "race", assist: 2, light: false, region: "eu" })).toBe(false);
    expect(shouldTriggerEpac({ mode: "race", assist: 4, light: false, region: "eu" })).toBe(false);
  });
});

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

  describe("deriveTripModeSelection — assist 3 forces EPAC", () => {
    const prefs = {
      autoModeEnabled: true,
      defaultMode: null,
      defaultAssist: null,
      defaultLight: null,
    };
    const tracking = { isTracking: true, speedKmh: 25 };

    it("returns eco when assist=3 even if autoModeEnabled and tracking", () => {
      const state = { ...baseState, assist: 3 };
      expect(deriveTripModeSelection(state, prefs, tracking, "auto")).toBe("eco");
    });

    it("returns eco when assist=3 even if currentSelection is auto", () => {
      const state = { ...baseState, assist: 3 };
      expect(deriveTripModeSelection(state, prefs, tracking, "auto")).toBe("eco");
    });

    it("allows auto when assist!=3 with autoModeEnabled and tracking", () => {
      const state = { ...baseState, assist: 2 };
      expect(deriveTripModeSelection(state, prefs, tracking, "auto")).toBe("auto");
    });

    it("returns eco when assist=3 and not tracking", () => {
      const state = { ...baseState, assist: 3 };
      expect(deriveTripModeSelection(state, prefs, { isTracking: false, speedKmh: null })).toBe(
        "eco",
      );
    });
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
    vi.useRealTimers();
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

  it("polls the bike and resets to EPAC when assist reaches the trigger level", async () => {
    vi.useFakeTimers();

    render(
      <Super73Provider enabled>
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));

    // Flush async connection chain (readState + applyConnectionPreferences)
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("vehicle:connected")).toBeTruthy();

    // Simulate bike state: rider set assist to 3 while in race mode
    readStateMock.mockResolvedValue({ ...baseState, mode: "race", assist: 3 });
    writeStateMock.mockClear();

    // Advance past the poll interval and flush async poll callback
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(writeStateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: "eco", assist: 3 }),
    );
    expect(screen.getByText("vehicle-mode:eco")).toBeTruthy();
  }, 15_000);

  it("does not write when assist is at trigger level but mode is already eco", async () => {
    vi.useFakeTimers();

    render(
      <Super73Provider enabled>
        <Consumer label="noop" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("noop connect"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("noop:connected")).toBeTruthy();

    // assist=3 but already in eco → no write expected
    readStateMock.mockResolvedValue({ ...baseState, mode: "eco", assist: 3 });
    writeStateMock.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(writeStateMock).not.toHaveBeenCalled();
  }, 15_000);

  it("sets epacPollFallbackWarning when poll catches the EPAC trigger (notifier unavailable)", async () => {
    vi.useFakeTimers();

    render(
      <Super73Provider enabled>
        <Consumer label="warn" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("warn connect"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("warn:connected")).toBeTruthy();
    expect(screen.getByText("warn-poll-warning:no")).toBeTruthy();

    readStateMock.mockResolvedValue({ ...baseState, mode: "race", assist: 3 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByText("warn-poll-warning:yes")).toBeTruthy();
  }, 15_000);

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
