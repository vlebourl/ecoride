import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrackingDashboard } from "../TrackingDashboard";
import { I18nProvider } from "@/i18n/provider";

const formatTime = (s: number) => `${s}s`;

const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

beforeEach(() => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
});

const baseProps = {
  isPaused: false,
  speedKmh: null,
  bleSpeedKmh: null,
  distance: 0,
  co2Saved: 0,
  elapsed: 0,
  formatTime,
};

describe("TrackingDashboard — speed source badge", () => {
  it("shows GPS badge when bleSpeedKmh is null", () => {
    renderWithI18n(<TrackingDashboard {...baseProps} speedKmh={30} bleSpeedKmh={null} />);
    expect(screen.getByText("GPS")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
  });

  it("shows Capteur badge and BLE speed when bleSpeedKmh is provided", () => {
    renderWithI18n(<TrackingDashboard {...baseProps} speedKmh={30} bleSpeedKmh={25} />);
    expect(screen.getByText("Capteur")).toBeTruthy();
    // displayed speed should be BLE (25), not GPS (30)
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.queryByText("30")).toBeNull();
  });

  it("falls back to GPS speed when bleSpeedKmh is null", () => {
    renderWithI18n(<TrackingDashboard {...baseProps} speedKmh={42} bleSpeedKmh={null} />);
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("GPS")).toBeTruthy();
  });

  it("does not show source badge when paused", () => {
    renderWithI18n(<TrackingDashboard {...baseProps} isPaused speedKmh={20} bleSpeedKmh={15} />);
    expect(screen.queryByText("GPS")).toBeNull();
    expect(screen.queryByText("Capteur")).toBeNull();
  });
});
