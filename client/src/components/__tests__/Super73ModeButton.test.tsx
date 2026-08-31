import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Super73ModeButton } from "../Super73ModeButton";
import { I18nProvider } from "@/i18n/provider";

const useSuper73Mock = vi.fn();

vi.mock("@/hooks/useSuper73", () => ({
  useSuper73: () => useSuper73Mock(),
}));

const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

describe("Super73ModeButton compact", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a square button that stretches with the action row", () => {
    useSuper73Mock.mockReturnValue({
      status: "disconnected",
      bikeState: null,
      error: null,
      tripModeSelection: "eco",
      connect: vi.fn(),
      disconnect: vi.fn(),
      setMode: vi.fn(),
      setAssist: vi.fn(),
      setLight: vi.fn(),
      toggleMode: vi.fn(),
      cycleTripModeSelection: vi.fn(),
    });

    renderWithI18n(<Super73ModeButton enabled compact />);

    const button = screen.getByRole("button", { name: "Super73 déconnecté" });
    expect(button.className).toContain("aspect-square");
    expect(button.className).toContain("self-stretch");
  });

  it("carries no headlight element: the trip header's HeadlightIndicator owns that", () => {
    useSuper73Mock.mockReturnValue({
      status: "connected",
      bikeState: { mode: "eco", assist: 2, light: true, region: "eu" },
      error: null,
      tripModeSelection: "eco",
      connect: vi.fn(),
      disconnect: vi.fn(),
      setMode: vi.fn(),
      setAssist: vi.fn(),
      setLight: vi.fn(),
      toggleMode: vi.fn(),
      cycleTripModeSelection: vi.fn(),
    });

    renderWithI18n(<Super73ModeButton enabled compact />);

    // The label names the mode only — a light state here would suggest the
    // button controls the headlight, which it never did.
    expect(screen.getByRole("button", { name: "Mode EPAC" })).toBeTruthy();
    expect(screen.queryByTestId("super73-light-state-icon")).toBeNull();
  });

  it("falls back to the mode label when bikeState is unavailable", () => {
    useSuper73Mock.mockReturnValue({
      status: "connected",
      bikeState: null,
      error: null,
      tripModeSelection: "eco",
      connect: vi.fn(),
      disconnect: vi.fn(),
      setMode: vi.fn(),
      setAssist: vi.fn(),
      setLight: vi.fn(),
      toggleMode: vi.fn(),
      cycleTripModeSelection: vi.fn(),
    });

    renderWithI18n(<Super73ModeButton enabled compact />);

    expect(screen.getByRole("button", { name: "Mode EPAC" })).toBeTruthy();
    expect(screen.queryByTestId("super73-light-state-icon")).toBeNull();
  });

  it("renders the Off-Road icon state", () => {
    useSuper73Mock.mockReturnValue({
      status: "connected",
      bikeState: { mode: "race", assist: 4, light: false, region: "us" },
      error: null,
      tripModeSelection: "race",
      connect: vi.fn(),
      disconnect: vi.fn(),
      setMode: vi.fn(),
      setAssist: vi.fn(),
      setLight: vi.fn(),
      toggleMode: vi.fn(),
      cycleTripModeSelection: vi.fn(),
    });

    renderWithI18n(<Super73ModeButton enabled compact />);

    expect(screen.getByRole("button", { name: "Mode Off-Road" })).toBeTruthy();
  });

  it("renders the Auto icon state", () => {
    useSuper73Mock.mockReturnValue({
      status: "connected",
      bikeState: { mode: "eco", assist: 2, light: false, region: "eu" },
      error: null,
      tripModeSelection: "auto",
      connect: vi.fn(),
      disconnect: vi.fn(),
      setMode: vi.fn(),
      setAssist: vi.fn(),
      setLight: vi.fn(),
      toggleMode: vi.fn(),
      cycleTripModeSelection: vi.fn(),
    });

    renderWithI18n(<Super73ModeButton enabled compact />);

    expect(screen.getByRole("button", { name: "Mode Auto" })).toBeTruthy();
  });
});
