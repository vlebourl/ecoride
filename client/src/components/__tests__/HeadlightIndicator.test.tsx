import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeadlightIndicator } from "../trip/HeadlightIndicator";
import { I18nProvider } from "@/i18n/provider";
import type { BleStatus } from "@/hooks/useSuper73";

const useSuper73Mock = vi.fn();

vi.mock("@/hooks/useSuper73", () => ({
  useSuper73: () => useSuper73Mock(),
}));

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

/**
 * Only the slice of the controller the component reads. `light: null` means the
 * bike state is unknown (no `bikeState` at all), not "light off".
 */
function mockBike({
  status = "connected" as BleStatus,
  light,
  setLight = vi.fn(),
}: {
  status?: BleStatus;
  light: boolean | null;
  setLight?: ReturnType<typeof vi.fn>;
}) {
  useSuper73Mock.mockReturnValue({
    status,
    bikeState: light === null ? null : { mode: "eco", assist: 2, light, region: "eu" },
    setLight,
  });
  return setLight;
}

const indicator = () => screen.getByTestId("headlight-indicator") as HTMLButtonElement;

describe("HeadlightIndicator", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the ON state as a pressed button labelled with the turn-off action", () => {
    mockBike({ light: true });

    wrap(<HeadlightIndicator />);

    expect(indicator().tagName).toBe("BUTTON");
    expect(indicator().getAttribute("data-state")).toBe("on");
    expect(indicator().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Éteindre le phare" })).toBeTruthy();
  });

  it("renders the OFF state as an unpressed button labelled with the turn-on action", () => {
    mockBike({ light: false });

    wrap(<HeadlightIndicator />);

    expect(indicator().getAttribute("data-state")).toBe("off");
    expect(indicator().getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Allumer le phare" })).toBeTruthy();
  });

  it("labels the control in English when the locale is English", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    mockBike({ light: false });

    wrap(<HeadlightIndicator />);

    expect(screen.getByRole("button", { name: "Turn headlight on" })).toBeTruthy();
  });

  it("turns the headlight on when tapped while off", () => {
    const setLight = mockBike({ light: false });

    wrap(<HeadlightIndicator />);
    indicator().click();

    expect(setLight).toHaveBeenCalledWith(true);
  });

  it("turns the headlight off when tapped while on", () => {
    const setLight = mockBike({ light: true });

    wrap(<HeadlightIndicator />);
    indicator().click();

    expect(setLight).toHaveBeenCalledWith(false);
  });

  it("never cycles the Super73 mode when tapped", () => {
    const setMode = vi.fn();
    const cycleTripModeSelection = vi.fn();
    useSuper73Mock.mockReturnValue({
      status: "connected",
      bikeState: { mode: "eco", assist: 2, light: false, region: "eu" },
      setLight: vi.fn(),
      setMode,
      cycleTripModeSelection,
    });

    wrap(<HeadlightIndicator />);
    indicator().click();

    expect(setMode).not.toHaveBeenCalled();
    expect(cycleTripModeSelection).not.toHaveBeenCalled();
  });

  it("renders nothing when the bike state is unknown", () => {
    mockBike({ light: null });

    const { container } = wrap(<HeadlightIndicator />);

    expect(container.querySelector('[data-testid="headlight-indicator"]')).toBeNull();
  });

  it("is disabled and does not write when disconnected", () => {
    const setLight = mockBike({ status: "disconnected", light: false });

    wrap(<HeadlightIndicator />);
    indicator().click();

    expect(indicator().disabled).toBe(true);
    expect(setLight).not.toHaveBeenCalled();
  });

  it("shows the light on once the bike confirms the requested change", () => {
    const setLight = mockBike({ light: false });

    const { rerender } = wrap(<HeadlightIndicator />);
    indicator().click();
    expect(setLight).toHaveBeenCalledWith(true);

    // The bike accepted and now reports "on".
    mockBike({ light: true, setLight });
    rerender(
      <I18nProvider>
        <HeadlightIndicator />
      </I18nProvider>,
    );

    expect(indicator().getAttribute("data-state")).toBe("on");
    expect(indicator().getAttribute("aria-pressed")).toBe("true");
  });

  it("stays off when the bike refuses the change and keeps reporting off", () => {
    const setLight = mockBike({ light: false });

    const { rerender } = wrap(<HeadlightIndicator />);
    indicator().click();
    expect(setLight).toHaveBeenCalledWith(true);

    // The bike refused: it still reports "off", so the UI must not sit on the
    // optimistic "on" it was asked for.
    mockBike({ light: false, setLight });
    rerender(
      <I18nProvider>
        <HeadlightIndicator />
      </I18nProvider>,
    );

    expect(indicator().getAttribute("data-state")).toBe("off");
    expect(indicator().getAttribute("aria-pressed")).toBe("false");
  });
});
