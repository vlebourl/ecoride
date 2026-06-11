import { render, screen } from "@testing-library/react";
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
});
