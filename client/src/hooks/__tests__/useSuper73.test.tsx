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
const readRideMock = vi.fn().mockResolvedValue(null);
const writeStateMock = vi.fn();
// Simulates notifier unavailable by default (returns null = firmware doesn't support it).
const startStateNotificationsMock = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/super73-ble", () => ({
  isBleSupported: () => true,
  isBleDebugEnabled: () => false,
  scanAndConnect: (...args: unknown[]) => scanAndConnectMock(...args),
  reconnectPairedDevice: (...args: unknown[]) => reconnectPairedDeviceMock(...args),
  readState: (...args: unknown[]) => readStateMock(...args),
  readRide: (...args: unknown[]) => readRideMock(...args),
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
      <button onClick={() => ble.disconnect()}>{label} disconnect</button>
      <button onClick={() => void ble.toggleMode()}>{label} toggle</button>
      <button onClick={() => void ble.setLight(true)}>{label} light-on</button>
      <button
        onClick={() => {
          // Fired back-to-back without awaiting: the realistic race is the rider
          // tapping the headlight while auto-mode issues its own write.
          void ble.setLight(true);
          void ble.setAssist(4);
        }}
      >
        {label} light+assist
      </button>
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
        {label}-selection:{ble.tripModeSelection}
      </span>
      <span>
        {label}-poll-warning:{ble.epacPollFallbackWarning ? "yes" : "no"}
      </span>
    </div>
  );
}

function BatteryConsumer({ label }: { label: string }) {
  const ble = useSuper73();
  // Render "null" vs "undefined" distinctly so the test fails (shows "undefined")
  // until the hook actually exposes the field initialised to null.
  const fmt = (v: number | null) => (v === null ? "null" : v === undefined ? "undefined" : v);
  return (
    <div>
      <span>
        {label}-battery:{fmt(ble.batteryPercent)}
      </span>
      <span>
        {label}-range:{fmt(ble.rangeKm)}
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
  it("builds a preferred state only when mode or assist differ", () => {
    expect(
      buildStateFromPreferences(baseState, {
        autoModeEnabled: false,
        defaultMode: null,
        defaultAssist: null,
      }),
    ).toBeNull();

    expect(
      buildStateFromPreferences(baseState, {
        autoModeEnabled: false,
        defaultMode: "race",
        defaultAssist: 4,
      }),
    ).toEqual({
      ...baseState,
      mode: "race",
      assist: 4,
    });
  });

  it("leaves the light bit alone — the connect cycle owns it", () => {
    // There is no light preference any more (#348): connecting always forces the
    // light on, so this must never be the thing that decides a write is needed.
    expect(
      buildStateFromPreferences(
        { ...baseState, light: true },
        { autoModeEnabled: false, defaultMode: null, defaultAssist: null },
      ),
    ).toBeNull();
    expect(
      buildStateFromPreferences(
        { ...baseState, light: true },
        { autoModeEnabled: false, defaultMode: "race", defaultAssist: null },
      ),
    ).toEqual({ ...baseState, mode: "race", light: true });
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

    it("shows off-road at assist=3 when the bike is actually still in race (EPAC write pending or failed)", () => {
      const state = { ...baseState, assist: 3, mode: "race" as const };
      // The icon must reflect reality, not blindly assume EPAC landed.
      expect(deriveTripModeSelection(state, prefs, tracking, "eco")).toBe("race");
      expect(deriveTripModeSelection(state, prefs, tracking, "race")).toBe("race");
    });

    it("keeps an explicit eco or race override while tracking with profile auto mode enabled", () => {
      const state = { ...baseState, assist: 2, mode: "tour" as const };
      expect(deriveTripModeSelection(state, prefs, tracking, "eco")).toBe("eco");
      expect(deriveTripModeSelection({ ...state, mode: "race" }, prefs, tracking, "race")).toBe(
        "race",
      );
    });
  });
});

describe("useSuper73 provider", () => {
  beforeEach(() => {
    // Recorded calls are asserted per test (writtenStates), and restoreAllMocks
    // does not clear hand-made vi.fn()s — without this they accumulate.
    vi.clearAllMocks();
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

  it("exposes null battery telemetry before any RIDE frame", () => {
    render(
      <Super73Provider enabled>
        <BatteryConsumer label="trip" />
      </Super73Provider>,
    );
    expect(screen.getByText("trip-battery:null")).toBeTruthy();
    expect(screen.getByText("trip-range:null")).toBeTruthy();
  });

  /** The states written at connect, in order, ignoring the session-guard arg. */
  const writtenStates = () => writeStateMock.mock.calls.map((call) => call[1] as Super73State);

  it("applies default mode and assist, then cycles the light off and on", async () => {
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
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });

    // Off then on, and the preferences ride along in both frames — the light bit
    // shares its 10-byte register with mode and assist.
    expect(writtenStates()).toEqual([
      { mode: "race", assist: 4, light: false, region: "eu" },
      { mode: "race", assist: 4, light: true, region: "eu" },
    ]);
    // Every write carries the session guard.
    for (const call of writeStateMock.mock.calls) {
      expect(call[2]).toEqual(expect.any(Function));
    }
    expect(screen.getByText("vehicle-mode:race")).toBeTruthy();
    expect(screen.getByText("vehicle-assist:4")).toBeTruthy();
    expect(screen.getByText("vehicle-light:on")).toBeTruthy();
  });

  // The AC lists these three separately; they differ only by the state the bike
  // reports, which is exactly the variable under test.
  it.each([
    ["the bike already reports the light on", { ...baseState, light: true }],
    ["the bike reports the light off", { ...baseState, light: false }],
    [
      "no preferences are set and nothing differs",
      { mode: "sport", assist: 1, light: false, region: "us" } as Super73State,
    ],
  ])("cycles the light off then on when %s", async (_label, reported) => {
    readStateMock.mockResolvedValue(reported);

    render(
      <Super73Provider enabled>
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));
    await waitFor(() => {
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });

    // A reported "already on" is not a reason to skip: the state can be stale,
    // and only a real off→on transition guarantees the hardware is lit. Mode and
    // assist ride along untouched — they share the light bit's register.
    expect(writtenStates()).toEqual([
      { ...reported, light: false },
      { ...reported, light: true },
    ]);
    expect(screen.getByText("vehicle-light:on")).toBeTruthy();
  });

  it("forces the light on even when the default-light preference is false", async () => {
    // #348 makes the cycle unconditional, so super73DefaultLight no longer
    // decides anything at connect. Locked in a test because it silently
    // overrides a user-facing toggle on the vehicle page.
    render(
      <Super73Provider
        enabled
        preferences={{
          autoModeEnabled: false,
          defaultMode: null,
          defaultAssist: null,
          defaultLight: false,
        }}
      >
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));
    await waitFor(() => {
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });

    expect(writtenStates()).toEqual([
      { ...baseState, light: false },
      { ...baseState, light: true },
    ]);
    expect(screen.getByText("vehicle-light:on")).toBeTruthy();
  });

  it("sends rider writes after the connect cycle, not before it", async () => {
    render(
      <Super73Provider enabled>
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));
    await waitFor(() => {
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("vehicle light-on"));
    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledTimes(3);
    });

    // The cycle owns the first two frames; a rider action queues behind them.
    expect(writtenStates().slice(0, 2)).toEqual([
      { ...baseState, light: false },
      { ...baseState, light: true },
    ]);
  });

  it("runs the light cycle when auto-reconnecting on mount", async () => {
    reconnectPairedDeviceMock.mockResolvedValue(buildDevice());

    render(
      <Super73Provider enabled>
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });

    expect(writtenStates()).toEqual([
      { ...baseState, light: false },
      { ...baseState, light: true },
    ]);
  });

  it("runs the light cycle again after reconnecting from an unexpected disconnect", async () => {
    const listeners: Record<string, () => void> = {};
    const device = {
      gatt: {
        connected: true,
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        listeners[event] = handler;
      }),
      removeEventListener: vi.fn(),
    } as unknown as BluetoothDevice;
    scanAndConnectMock.mockResolvedValue(device);
    reconnectPairedDeviceMock.mockResolvedValue(device);

    render(
      <Super73Provider enabled>
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));
    await waitFor(() => {
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });
    writeStateMock.mockClear();

    // The bike drops on its own; the app retries after RECONNECT_DELAY.
    vi.useFakeTimers();
    await act(async () => {
      listeners["gattserverdisconnected"]?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });

    // A reconnection is a connection: the cycle has to run again, or a bike that
    // dropped and came back would be left dark.
    expect(writtenStates()).toEqual([
      { ...baseState, light: false },
      { ...baseState, light: true },
    ]);
  });

  it("surfaces an error and does not half-initialise when the first light write fails", async () => {
    writeStateMock.mockRejectedValueOnce(new Error("GATT operation failed"));

    render(
      <Super73Provider enabled>
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));

    await waitFor(() => {
      expect(screen.getByText("vehicle:error")).toBeTruthy();
    });
    // Half-initialised would mean a live notifier subscription on a bike whose
    // init never completed.
    expect(startStateNotificationsMock).not.toHaveBeenCalled();
  });

  it("retries the ON write once rather than leaving the bike dark", async () => {
    // The OFF frame has already landed by now, so giving up here would strand the
    // rider with a bike this app just switched off. A transient GATT timeout must
    // not be what turns someone's headlight off at night.
    writeStateMock
      .mockResolvedValueOnce(undefined) // light OFF lands
      .mockRejectedValueOnce(new Error("GATT operation failed")) // light ON fails
      .mockResolvedValue(undefined); // retry succeeds

    render(
      <Super73Provider enabled>
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));
    await waitFor(() => {
      expect(screen.getByText("vehicle:connected")).toBeTruthy();
    });

    expect(writtenStates()).toEqual([
      { ...baseState, light: false },
      { ...baseState, light: true },
      { ...baseState, light: true },
    ]);
    expect(screen.getByText("vehicle-light:on")).toBeTruthy();
  });

  it("surfaces an error when the ON write fails twice", async () => {
    writeStateMock
      .mockResolvedValueOnce(undefined) // light OFF lands
      .mockRejectedValue(new Error("GATT operation failed")); // ON fails, retry fails

    render(
      <Super73Provider enabled>
        <Consumer label="vehicle" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("vehicle connect"));

    // Nothing more this code can do alone: tell the rider rather than report a
    // healthy connection to an unlit bike.
    await waitFor(() => {
      expect(screen.getByText("vehicle:error")).toBeTruthy();
    });
    expect(startStateNotificationsMock).not.toHaveBeenCalled();
  });

  // TODO: poll disabled — these three tests cover the fixed-interval EPAC poll which is
  // currently commented out in useSuper73.ts pending observation. Re-enable if poll is
  // reintroduced; delete if poll is removed permanently.
  //
  // it("polls the bike and resets to EPAC when assist reaches the trigger level", ...)
  // it("does not write when assist is at trigger level but mode is already eco", ...)
  // it("sets epacPollFallbackWarning when poll catches the EPAC trigger (notifier unavailable)", ...)

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
      expect(writeStateMock).toHaveBeenCalledWith(
        expect.anything(),
        { ...baseState, mode: "race" },
        // Session guard, re-checked inside the GATT queue.
        expect.any(Function),
      );
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
      expect(writeStateMock).toHaveBeenCalledWith(
        expect.anything(),
        { ...baseState, mode: "eco" },
        expect.any(Function),
      );
    });
  });
});

// Regression for issue #326: in connected-bike mode, selecting Off-Road then using
// the bike's assist-3 button to force EPAC must NOT leave a stale "race" selection
// behind. Otherwise, once the rider moves assist back to 4, the mode stays EPAC
// (eco) but the compact icon resurfaces as Off-Road (blue triangle).
describe("useSuper73 provider — EPAC enforcement resets stale trip-mode selection (issue #326)", () => {
  let notify: ((state: Super73State) => void) | undefined;
  // Simulated bike: reads report whatever the last accepted write left behind, so a
  // write that fails (or is refused) is visible as the state simply not changing.
  let bikeSim: Super73State;

  /** The bike pushes a state packet; later reads report it too. */
  async function bikeReports(state: Super73State) {
    bikeSim = state;
    await act(async () => {
      notify?.(state);
    });
  }

  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
    reconnectPairedDeviceMock.mockResolvedValue(null);
    // Bike starts in EPAC (eco) at assist 4 so toggleMode flips the selection to race.
    bikeSim = { mode: "eco", assist: 4, light: false, region: "eu" };
    readStateMock.mockImplementation(() => Promise.resolve(bikeSim));
    writeStateMock.mockImplementation((_server: unknown, next: Super73State) => {
      bikeSim = next;
      return Promise.resolve(undefined);
    });
    scanAndConnectMock.mockResolvedValue(buildDevice());
    // Capture the notifier callback so the test can simulate bike-side state pushes.
    notify = undefined;
    startStateNotificationsMock.mockImplementation((_server: unknown, onState: unknown) => {
      notify = onState as (state: Super73State) => void;
      return Promise.resolve(() => {});
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    // Restore the default (notifier unavailable) for the rest of the suite.
    startStateNotificationsMock.mockReset().mockResolvedValue(null);
  });

  it("keeps the icon on EPAC after assist 3 → 4 when Off-Road was previously selected", async () => {
    render(
      <Super73Provider enabled tracking={{ isTracking: true, speedKmh: 20 }}>
        <Consumer label="trip" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("trip connect"));
    await waitFor(() => {
      expect(screen.getByText("trip:connected")).toBeTruthy();
    });

    // Rider selects Off-Road → intent becomes "race", icon shows Off-Road.
    fireEvent.click(screen.getByText("trip toggle"));
    await waitFor(() => {
      expect(screen.getByText("trip-mode:race")).toBeTruthy();
      expect(screen.getByText("trip-selection:race")).toBeTruthy();
    });

    // Rider sets assist to 3 on the bike → EPAC enforcement forces mode back to eco.
    await bikeReports({ mode: "race", assist: 3, light: false, region: "eu" });
    await waitFor(() => {
      expect(screen.getByText("trip-mode:eco")).toBeTruthy();
      // Masked by the assist===3 branch while assist stays at the trigger level.
      expect(screen.getByText("trip-selection:eco")).toBeTruthy();
    });

    // Rider sets assist back to 4 → mode stays EPAC; the icon MUST stay EPAC too.
    await bikeReports({ mode: "eco", assist: 4, light: false, region: "eu" });
    await waitFor(() => {
      expect(screen.getByText("trip-assist:4")).toBeTruthy();
    });
    expect(screen.getByText("trip-mode:eco")).toBeTruthy();
    // Before the fix this resurfaced as "race" (Off-Road icon) — the bug.
    expect(screen.getByText("trip-selection:eco")).toBeTruthy();
  });

  it("keeps the icon on the real off-road mode when the EPAC write fails", async () => {
    render(
      <Super73Provider enabled tracking={{ isTracking: true, speedKmh: 20 }}>
        <Consumer label="trip" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("trip connect"));
    await waitFor(() => {
      expect(screen.getByText("trip:connected")).toBeTruthy();
    });

    // Rider selects Off-Road → intent "race".
    fireEvent.click(screen.getByText("trip toggle"));
    await waitFor(() => {
      expect(screen.getByText("trip-mode:race")).toBeTruthy();
      expect(screen.getByText("trip-selection:race")).toBeTruthy();
    });

    // The EPAC enforcement write fails (bike out of range, GATT error, ...).
    writeStateMock.mockRejectedValueOnce(new Error("BLE write failed"));

    // Rider sets assist to 3 — enforcement is attempted but the write fails, so the
    // bike stays in race.
    await bikeReports({ mode: "race", assist: 3, light: false, region: "eu" });
    // While assist stays at 3, the icon must NOT claim EPAC — the bike is still in
    // off-road because the write failed.
    await waitFor(() => {
      expect(screen.getByText("trip-mode:race")).toBeTruthy();
      expect(screen.getByText("trip-selection:race")).toBeTruthy();
    });

    // Rider sets assist back to 4 — the bike is still in race (the write failed).
    await bikeReports({ mode: "race", assist: 4, light: false, region: "eu" });
    await waitFor(() => {
      expect(screen.getByText("trip-assist:4")).toBeTruthy();
    });

    // The icon must reflect the bike's real mode (off-road), not a phantom EPAC.
    // An over-eager intent reset (before the write is confirmed) would lie here.
    expect(screen.getByText("trip-mode:race")).toBeTruthy();
    expect(screen.getByText("trip-selection:race")).toBeTruthy();
  });

  it("guards the EPAC enforcement write with the session", async () => {
    render(
      <Super73Provider enabled tracking={{ isTracking: true, speedKmh: 20 }}>
        <Consumer label="trip" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("trip connect"));
    await waitFor(() => {
      expect(screen.getByText("trip:connected")).toBeTruthy();
    });

    // Rider hits assist 3 on the bike: EPAC enforcement writes eco.
    await bikeReports({ mode: "race", assist: 3, light: false, region: "eu" });
    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalled();
    });

    // This write is queued like any other, so it must carry a session guard that
    // stops it once the bike is gone — it is issued from the notifier, the path
    // most likely to fire just as the link drops.
    const guard = writeStateMock.mock.calls.at(-1)![2] as () => boolean;
    expect(guard()).toBe(true);

    fireEvent.click(screen.getByText("trip disconnect"));
    await waitFor(() => {
      expect(screen.getByText("trip:disconnected")).toBeTruthy();
    });

    expect(guard()).toBe(false);
  });
});

describe("useSuper73 provider — setLight commits the bike's reported state (issue #347)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorageStub());
    reconnectPairedDeviceMock.mockResolvedValue(null);
    writeStateMock.mockResolvedValue(undefined);
    scanAndConnectMock.mockResolvedValue(buildDevice());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Both carry per-test implementations closing over that test's simulated
    // bike — leaking one into the next test wires it to a stale bike.
    readStateMock.mockReset();
    writeStateMock.mockReset();
  });

  async function connect() {
    render(
      <Super73Provider enabled>
        <Consumer label="trip" />
      </Super73Provider>,
    );
    fireEvent.click(screen.getByText("trip connect"));
    await waitFor(() => {
      expect(screen.getByText("trip:connected")).toBeTruthy();
    });
    // Connecting now writes twice on its own (the light off→on cycle, #348).
    // These tests are about what happens *after* connecting, so start from zero.
    writeStateMock.mockClear();
  }

  it("shows the light on when the bike confirms the write", async () => {
    // Read-back after the write reports the light actually came on.
    readStateMock
      .mockResolvedValueOnce({ ...baseState, light: false }) // initial connect read
      .mockResolvedValue({ ...baseState, light: true });

    await connect();
    fireEvent.click(screen.getByText("trip light-on"));

    await waitFor(() => {
      expect(screen.getByText("trip-light:on")).toBeTruthy();
    });
  });

  it("keeps the light off when the bike refuses the write and still reports off", async () => {
    // The bike never accepts the change: every read still says the light is off.
    readStateMock.mockResolvedValue({ ...baseState, light: false });

    await connect();
    fireEvent.click(screen.getByText("trip light-on"));

    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ light: true }),
        expect.any(Function),
      );
    });
    // The UI must follow the bike, not the value that was requested.
    expect(screen.getByText("trip-light:off")).toBeTruthy();
  });

  it("keeps the successful write when only the confirmation read fails", async () => {
    readStateMock
      .mockResolvedValueOnce({ ...baseState, light: false }) // initial connect read
      .mockResolvedValueOnce({ ...baseState, light: false }) // read before the write
      .mockRejectedValueOnce(new Error("GATT operation failed")); // read-back fails

    await connect();
    fireEvent.click(screen.getByText("trip light-on"));

    await waitFor(() => {
      expect(screen.getByText("trip-light:on")).toBeTruthy();
    });
    // The write landed: a failed read-back must not be reported as a connection
    // error, which would hide the controls over a change that actually applied.
    expect(screen.getByText("trip:connected")).toBeTruthy();
  });

  it("does not let a concurrent update clobber the previous one", async () => {
    // A bike that accepts writes: each read reports the last accepted write.
    let bikeSim: Super73State = { ...baseState, light: false, assist: 2 };
    readStateMock.mockImplementation(() => Promise.resolve(bikeSim));
    writeStateMock.mockImplementation((_server: unknown, next: Super73State) => {
      bikeSim = next;
      return Promise.resolve(undefined);
    });

    await connect();
    fireEvent.click(screen.getByText("trip light+assist"));

    await waitFor(() => {
      expect(screen.getByText("trip-assist:4")).toBeTruthy();
    });
    // Both patches must survive. Unserialised, the two updates each read the
    // pre-write state and the second write drops the first one's light change.
    expect(screen.getByText("trip-light:on")).toBeTruthy();
    expect(bikeSim).toMatchObject({ light: true, assist: 4 });
  });

  it("drops a queued update when the bike reconnects before its turn", async () => {
    let bikeSim: Super73State = { ...baseState, light: false, assist: 2 };
    readStateMock.mockImplementation(() => Promise.resolve(bikeSim));

    // Hold the first write open so the second update is still queued behind it.
    let releaseWrite!: () => void;
    const firstWriteHeld = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    writeStateMock.mockImplementation((_server: unknown, next: Super73State) => {
      bikeSim = next;
      return Promise.resolve(undefined);
    });

    await connect();

    // Queued after connecting, so the connect-time cycle does not consume it.
    writeStateMock.mockImplementationOnce(async (_server: unknown, next: Super73State) => {
      await firstWriteHeld;
      bikeSim = next;
    });
    fireEvent.click(screen.getByText("trip light+assist"));
    // Let the first update reach its (held) write, so the second is genuinely
    // queued behind it rather than not started yet.
    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledTimes(1);
    });

    // The rider loses the bike and reconnects while the second update waits.
    fireEvent.click(screen.getByText("trip disconnect"));
    await waitFor(() => {
      expect(screen.getByText("trip:disconnected")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("trip connect"));
    await waitFor(() => {
      expect(screen.getByText("trip:connected")).toBeTruthy();
    });

    await act(async () => {
      releaseWrite();
      await firstWriteHeld;
    });

    // The queued assist write belonged to the previous BLE session: replaying it
    // onto the new one would apply a command the rider issued to a bike that has
    // since dropped.
    // Reconnecting runs the light off→on cycle, so counting writes no longer
    // isolates this. What matters is that the queued assist change never landed.
    // Reconnecting runs the light off→on cycle, so a bare call count no longer
    // isolates this. Assert the shape instead: the first update's write, then the
    // two cycle writes, and none of them the queued assist change. Checking the
    // count too keeps the filter from being vacuously empty.
    const written = writeStateMock.mock.calls.map((call) => call[1] as Super73State);
    expect(written).toHaveLength(3);
    expect(written.filter((state) => state.assist === 4)).toEqual([]);
    expect(bikeSim.assist).toBe(2);
  });

  it("does not publish state read from a connection that dropped mid-update", async () => {
    // Hold the confirmation read open so the bike can drop mid-sequence.
    let releaseReadBack!: (state: Super73State) => void;
    const readBackHeld = new Promise<Super73State>((resolve) => {
      releaseReadBack = resolve;
    });
    readStateMock
      .mockResolvedValueOnce({ ...baseState, light: false }) // initial connect read
      .mockResolvedValueOnce({ ...baseState, light: false }) // read before the write
      .mockImplementationOnce(() => readBackHeld); // confirmation read
    writeStateMock.mockResolvedValue(undefined);

    await connect();
    fireEvent.click(screen.getByText("trip light-on"));
    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledTimes(1);
    });

    // The rider disconnects before the confirmation read comes back.
    fireEvent.click(screen.getByText("trip disconnect"));
    await waitFor(() => {
      expect(screen.getByText("trip:disconnected")).toBeTruthy();
    });

    await act(async () => {
      // Mode is the observable here: connecting now forces the light on (#348),
      // so the light bit can no longer show whether this state was published.
      releaseReadBack({ ...baseState, mode: "race", light: true });
      await readBackHeld;
    });

    // A disconnect ends the session on its own: state read over a connection the
    // rider has left must not be published, or the UI describes a bike it is no
    // longer talking to.
    expect(screen.getByText("trip-mode:tour")).toBeTruthy();
  });

  it("does not write to the bike when the session ends before the write", async () => {
    // Hold the pre-write read open so the session can end between read and write.
    let releasePreRead!: (state: Super73State) => void;
    const preReadHeld = new Promise<Super73State>((resolve) => {
      releasePreRead = resolve;
    });
    readStateMock
      .mockResolvedValueOnce({ ...baseState, light: false }) // initial connect read
      .mockImplementationOnce(() => preReadHeld); // read before the write
    writeStateMock.mockResolvedValue(undefined);

    await connect();
    fireEvent.click(screen.getByText("trip light-on"));
    await waitFor(() => {
      expect(readStateMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByText("trip disconnect"));
    await waitFor(() => {
      expect(screen.getByText("trip:disconnected")).toBeTruthy();
    });

    await act(async () => {
      releasePreRead({ ...baseState, light: false });
      await preReadHeld;
    });

    // The session ended mid-sequence. Writing now sends a command built from a
    // pre-disconnect read — and since reconnecting reuses the same `device.gatt`,
    // it could land on the next session's bike.
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it("hands writeState a session guard that goes false once the bike drops", async () => {
    readStateMock.mockResolvedValue({ ...baseState, light: false });
    writeStateMock.mockResolvedValue(undefined);

    await connect();
    fireEvent.click(screen.getByText("trip light-on"));
    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledTimes(1);
    });

    // super73-ble re-checks this from inside the GATT queue, right before the
    // bytes go out. It has to track the live session, not just return true.
    const guard = writeStateMock.mock.calls[0]![2] as () => boolean;
    expect(guard()).toBe(true);

    fireEvent.click(screen.getByText("trip disconnect"));
    await waitFor(() => {
      expect(screen.getByText("trip:disconnected")).toBeTruthy();
    });

    expect(guard()).toBe(false);
  });

  it("does not report connected when the bike drops while preferences are applied", async () => {
    readStateMock.mockResolvedValue({ ...baseState, mode: "eco", assist: 1, light: false });

    // Hold the preferences write open so the rider can disconnect mid-connect.
    let releaseWrite!: () => void;
    const writeHeld = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    writeStateMock.mockImplementation(() => writeHeld);

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
        <Consumer label="trip" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("trip connect"));
    await waitFor(() => {
      expect(writeStateMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText("trip disconnect"));
    await waitFor(() => {
      expect(screen.getByText("trip:disconnected")).toBeTruthy();
    });

    await act(async () => {
      releaseWrite();
      await writeHeld;
    });

    // Finishing the connect sequence for a session that already ended would show
    // a connected bike the app is not talking to — and every control with it.
    expect(screen.getByText("trip:disconnected")).toBeTruthy();
  });

  it("reports disconnected, not error, when the bike drops mid-connect", async () => {
    // A real drop makes the in-flight GATT operation reject, rather than
    // resolving into a session check.
    let failRead!: (e: Error) => void;
    const readHeld = new Promise<Super73State>((_resolve, reject) => {
      failRead = reject;
    });
    readStateMock.mockImplementationOnce(() => readHeld);

    render(
      <Super73Provider enabled>
        <Consumer label="trip" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("trip connect"));
    await waitFor(() => {
      expect(readStateMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText("trip disconnect"));
    await waitFor(() => {
      expect(screen.getByText("trip:disconnected")).toBeTruthy();
    });

    await act(async () => {
      failRead(new Error("GATT Server is disconnected"));
      await readHeld.catch(() => {});
    });

    // The drop is the explanation, not a failure to report: onDisconnected has
    // already set the right status and surfacing "error" would overwrite it.
    expect(screen.getByText("trip:disconnected")).toBeTruthy();
  });

  it("treats a real GATT drop during connect as a disconnect, not an error", async () => {
    // Real ordering: the link dies, the in-flight operation rejects immediately,
    // and `gattserverdisconnected` is only delivered later — so at the moment of
    // the rejection the session counter has not moved yet.
    const gatt = {
      connected: true,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    const device = {
      gatt,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as BluetoothDevice;
    scanAndConnectMock.mockResolvedValue(device);
    readStateMock.mockImplementationOnce(() => {
      gatt.connected = false;
      return Promise.reject(new Error("GATT Server is disconnected"));
    });

    render(
      <Super73Provider enabled>
        <Consumer label="trip" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("trip connect"));

    // Losing the bike is not a connection failure to report as such.
    await waitFor(() => {
      expect(screen.getByText("trip:disconnected")).toBeTruthy();
    });
  });

  it("still reports error when the link is alive and the connect read fails", async () => {
    // Contrast to the test above: the bike is still there, so this really is a
    // failure. Swallowing every rejection would hide genuine connection faults.
    scanAndConnectMock.mockResolvedValue(buildDevice());
    readStateMock.mockRejectedValueOnce(new Error("GATT operation failed"));

    render(
      <Super73Provider enabled>
        <Consumer label="trip" />
      </Super73Provider>,
    );

    fireEvent.click(screen.getByText("trip connect"));

    await waitFor(() => {
      expect(screen.getByText("trip:error")).toBeTruthy();
    });
  });
});
