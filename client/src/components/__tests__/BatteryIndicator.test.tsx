import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BatteryIndicator } from "../trip/BatteryIndicator";
import { I18nProvider } from "@/i18n/provider";

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("BatteryIndicator", () => {
  it("shows percent and range when available", () => {
    wrap(<BatteryIndicator percent={75} rangeKm={65} />);
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText(/65/)).toBeTruthy();
  });

  it("renders nothing when percent is null", () => {
    const { container } = wrap(<BatteryIndicator percent={null} rangeKm={null} />);
    expect(container.querySelector('[data-testid="battery-indicator"]')).toBeNull();
  });
});
