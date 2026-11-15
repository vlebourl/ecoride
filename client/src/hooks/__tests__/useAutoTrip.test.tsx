import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { AutoTripController, useAutoTripHandlers } from "../useAutoTrip";
import { AUTO_TRIP_CONFIG } from "@/lib/auto-trip";
import type * as AutoTripModule from "@/lib/auto-trip";

const navigateMock = vi.fn();
const startMock = vi.fn();
const stopMock = vi.fn();

const world = {
  enabled: true,
  pathname: "/",
  stoppedSession: false,
  backup: null as object | null,
  ble: { status: "connected", bikeSpeedKmh: 22 as number | null },
  gps: { isTracking: false, isPaused: false, distanceKm: 0, durationSec: 0 },
};

vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: world.pathname }),
}));
vi.mock("@/hooks/useSuper73", () => ({ useSuper73: () => world.ble }));
vi.mock("@/hooks/useGpsTracking", () => ({
  useAppGpsTracking: () => ({ state: world.gps }),
  getTrackingBackup: () => world.backup,
}));
vi.mock("@/lib/stopped-session", () => ({ hasStoppedSession: () => world.stoppedSession }));
vi.mock("@/lib/auto-trip", async (importActual) => ({
  ...(await importActual<typeof AutoTripModule>()),
  isAutoTripEnabled: () => world.enabled,
}));

function TripScreen() {
  useAutoTripHandlers(startMock, stopMock);
  return null;
}

function App({ withTripScreen }: { withTripScreen: boolean }) {
  return (
    <>
      <AutoTripController />
      {withTripScreen && <TripScreen />}
    </>
  );
}

const ride = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("AutoTripController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigateMock.mockReset();
    startMock.mockReset();
    stopMock.mockReset();
    Object.assign(world, { enabled: true, pathname: "/", stoppedSession: false, backup: null });
    world.ble = { status: "connected", bikeSpeedKmh: 22 };
    world.gps = { isTracking: false, isPaused: false, distanceKm: 0, durationSec: 0 };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing while the setting is off", () => {
    world.enabled = false;
    render(<App withTripScreen />);
    ride(60_000);
    expect(startMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("starts the trip through the trip screen once the bike is riding", () => {
    render(<App withTripScreen />);
    ride(4_000);
    expect(startMock).not.toHaveBeenCalled();
    ride(3_000);
    expect(startMock).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("opens the trip screen when it is not mounted", () => {
    render(<App withTripScreen={false} />);
    ride(7_000);
    expect(navigateMock).toHaveBeenCalledWith("/trip");
    expect(startMock).not.toHaveBeenCalled();
  });

  it("never starts over a trip that is still waiting to be saved", () => {
    world.stoppedSession = true;
    render(<App withTripScreen={false} />);
    ride(60_000);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
  });

  it("never starts over an interrupted trip that can still be restored", () => {
    world.backup = { gpsPoints: [] };
    render(<App withTripScreen />);
    ride(60_000);
    expect(startMock).not.toHaveBeenCalled();
  });

  it("stops the trip at the last movement once the bike has gone quiet", () => {
    world.gps = { isTracking: true, isPaused: false, distanceKm: 3.4, durationSec: 480 };
    const view = render(<App withTripScreen />);
    ride(3_000);
    const lastMovementAt = Date.now();

    // Bike switched off at the destination; the GPS duration keeps running.
    world.ble = { status: "disconnected", bikeSpeedKmh: null };
    world.gps = { ...world.gps, durationSec: 780 };
    view.rerender(<App withTripScreen />);
    ride(AUTO_TRIP_CONFIG.stopAfterMs - 2_000);
    expect(stopMock).not.toHaveBeenCalled();
    ride(3_000);
    expect(stopMock).toHaveBeenCalledWith({
      at: lastMovementAt,
      distanceKm: 3.4,
      durationSec: 480,
      autoStarted: false,
    });
  });
});
