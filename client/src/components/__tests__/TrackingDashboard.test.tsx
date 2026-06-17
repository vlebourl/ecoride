import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackingDashboard } from "../trip/TrackingDashboard";
import { I18nProvider } from "@/i18n/provider";

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);
const base = {
  isPaused: false,
  speedKmh: 24,
  distance: 0,
  co2Saved: 0,
  elapsed: 0,
  formatTime: () => "00:00",
};

describe("TrackingDashboard", () => {
  it("renders both gauges when assist and classe levels are provided", () => {
    const { container } = wrap(<TrackingDashboard {...base} assistLevel={2} classeLevel={1} />);
    // 2 (assist) + 1 (classe) = 3 filled cells across both stacks
    expect(container.querySelectorAll('[data-filled="true"]').length).toBe(3);
    expect(screen.getByText("24")).toBeTruthy();
  });

  it("renders speed only when no levels are provided (unchanged dashboard)", () => {
    const { container } = wrap(<TrackingDashboard {...base} />);
    expect(container.querySelectorAll('[data-filled="true"]').length).toBe(0);
    expect(screen.getByText("24")).toBeTruthy();
  });

  it("lays the hero out as a 3-column grid so the speed stays centered between edge gauges", () => {
    const { container } = wrap(<TrackingDashboard {...base} assistLevel={2} classeLevel={1} />);
    const hero = container.querySelector('[data-testid="tracking-hero"]');
    expect(hero).toBeTruthy();
    expect(hero!.className).toContain("grid-cols-3");
  });

  it("pins the assist gauge to the left edge and the classe gauge to the right edge", () => {
    wrap(<TrackingDashboard {...base} assistLevel={3} classeLevel={4} />);
    const left = screen.getByTestId("hero-gauge-left");
    const right = screen.getByTestId("hero-gauge-right");
    // assist gauge sits in the left slot, classe gauge in the right slot
    expect(within(left).getByLabelText(/Assist 3\/4/)).toBeTruthy();
    expect(within(right).getByLabelText(/Class 4\/4/)).toBeTruthy();
    expect(left.className).toContain("justify-self-start");
    expect(right.className).toContain("justify-self-end");
  });

  it("keeps the speed centered when only the assist gauge is present (US mode, no classe)", () => {
    wrap(<TrackingDashboard {...base} assistLevel={2} />);
    // left slot holds the assist gauge, right slot exists but is empty
    expect(
      within(screen.getByTestId("hero-gauge-left")).getByLabelText(/Assist 2\/4/),
    ).toBeTruthy();
    expect(within(screen.getByTestId("hero-gauge-right")).queryByRole("img")).toBeNull();
    expect(screen.getByText("24")).toBeTruthy();
  });

  it("keeps the speed centered when only the classe gauge is present", () => {
    wrap(<TrackingDashboard {...base} classeLevel={1} />);
    expect(within(screen.getByTestId("hero-gauge-left")).queryByRole("img")).toBeNull();
    expect(
      within(screen.getByTestId("hero-gauge-right")).getByLabelText(/Class 1\/4/),
    ).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
  });
});
