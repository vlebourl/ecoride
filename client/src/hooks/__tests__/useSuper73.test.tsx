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
      <button onClick={() => void ble.toggleMode()}>{label} toggle</button>
      <button onClick={() => void ble.setLight(true)}>{label} light-on</button>
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
    readStateMock.mockReset();
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
      );
    });
    // The UI must follow the bike, not the value that was requested.
    expect(screen.getByText("trip-light:off")).toBeTruthy();
  });
});
