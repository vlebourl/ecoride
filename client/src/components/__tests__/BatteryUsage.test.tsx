import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatteryRangeCard, TripBatteryUsage } from "../BatteryUsage";
import { BatteryIndicator } from "../trip/BatteryIndicator";
import { I18nProvider } from "@/i18n/provider";
import { saveBatteryRecord } from "@/lib/battery-usage";

const ble = vi.hoisted(() => ({ status: "disconnected", rangeKm: null as number | null }));
vi.mock("@/hooks/useSuper73", () => ({ useSuper73: () => ble }));
vi.mock("@/hooks/useGpsTracking", () => ({
  useAppGpsTracking: () => ({ state: { isTracking: false, isPaused: false, distanceKm: 0 } }),
  getTrackingSession: () => null,
}));

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

const save = (startedAt: string, start: number, end: number, km: number) =>
  saveBatteryRecord({
    startedAt,
    startRangeKm: start,
    startDistanceKm: 0,
    endRangeKm: end,
    endDistanceKm: km,
    minRangeKm: end,
    recharged: false,
  });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ecoride-locale", "fr");
  Object.assign(ble, { status: "disconnected", rangeKm: null });
});

describe("TripBatteryUsage", () => {
  it("shows both readings, the drop and the ratio per km", () => {
    save("2026-11-15T08:00:00.000Z", 57, 51, 5.2);
    wrap(<TripBatteryUsage startedAt="2026-11-15T08:00:00.000Z" />);
    expect(screen.getByText("Autonomie affichée : 57 → 51 km (−6 km, ≈ −10 %)")).toBeTruthy();
    expect(screen.getByText("1.15 km d'autonomie par km parcouru, mesuré sur 5.2 km")).toBeTruthy();
    // Labelled as the bike's estimate, not as a measured charge.
    expect(screen.getByText("Batterie · estimation du vélo")).toBeTruthy();
  });

  it("shows nothing for a trip without two readings", () => {
    const { container } = wrap(<TripBatteryUsage startedAt="2026-11-15T08:00:00.000Z" />);
    expect(container.querySelector('[data-testid="trip-battery-usage"]')).toBeNull();
  });
});

describe("BatteryRangeCard", () => {
  it("shows the race-mode cost and the range by month (#423)", () => {
    const rec = (startedAt: string, drop: number, raceShare: number) =>
      saveBatteryRecord({
        startedAt,
        startRangeKm: 50,
        startDistanceKm: 0,
        endRangeKm: 50 - drop,
        endDistanceKm: 10,
        minRangeKm: 50 - drop,
        recharged: false,
        raceKm: 10 * raceShare,
      });
    rec("2026-10-01T08:00:00.000Z", 10, 0);
    rec("2026-10-02T08:00:00.000Z", 10, 0);
    rec("2026-10-03T08:00:00.000Z", 10, 0);
    rec("2026-11-01T08:00:00.000Z", 15, 1);
    rec("2026-11-02T08:00:00.000Z", 15, 1);
    rec("2026-11-03T08:00:00.000Z", 15, 1);
    wrap(<BatteryRangeCard />);
    expect(screen.getByTestId("battery-mode-cost").textContent).toBe(
      "Mode race : +50 % de batterie par km par rapport aux autres modes.",
    );
    const months = screen.getByTestId("battery-months").textContent;
    expect(months).toContain("2026-10≈ 60 km");
    expect(months).toContain("2026-11≈ 40 km");
  });

  it("shows progress instead of a figure before enough trips", () => {
    save("a", 50, 40, 8);
    wrap(<BatteryRangeCard />);
    expect(
      screen.getByText(/pas encore assez de trajets mesurés \(1\/3 trajets, 10\/20 km/),
    ).toBeTruthy();
    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it("shows the learned full-charge range, and says the percentage is derived", () => {
    save("a", 50, 40, 8);
    save("b", 40, 30, 8);
    save("c", 30, 20, 8);
    wrap(<BatteryRangeCard />);
    expect(screen.getByText("≈ 48 km")).toBeTruthy();
    expect(screen.getByText(/D'après 3 trajets mesurés : 0.80 km réels/)).toBeTruthy();
    expect(screen.getByText(/ce n'est pas une mesure de charge/)).toBeTruthy();
    // Bike not connected: no remaining-range line.
    expect(screen.queryByText(/Autonomie restante estimée/)).toBeNull();
  });

  it("rescales the bike's current estimate when it is connected", () => {
    save("a", 50, 40, 8);
    save("b", 40, 30, 8);
    save("c", 30, 20, 8);
    Object.assign(ble, { status: "connected", rangeKm: 50 });
    wrap(<BatteryRangeCard />);
    expect(
      screen.getByText("Autonomie restante estimée : ≈ 40 km (le vélo affiche 50 km)."),
    ).toBeTruthy();
  });
});

describe("BatteryIndicator", () => {
  it("marks a learned range as approximate", () => {
    wrap(<BatteryIndicator percent={83} rangeKm={40} learned />);
    expect(screen.getByTestId("battery-indicator").textContent).toContain("≈ 40 km");
  });

  it("shows the bike's own figure unmarked", () => {
    wrap(<BatteryIndicator percent={83} rangeKm={50} />);
    expect(screen.getByTestId("battery-indicator").textContent).not.toContain("≈");
  });
});
