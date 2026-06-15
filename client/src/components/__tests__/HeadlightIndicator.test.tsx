import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeadlightIndicator } from "../trip/HeadlightIndicator";
import { I18nProvider } from "@/i18n/provider";

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("HeadlightIndicator", () => {
  it("renders the ON state with an accessible label when the headlight is on", () => {
    wrap(<HeadlightIndicator on={true} />);
    const el = screen.getByTestId("headlight-indicator");
    expect(el).toBeTruthy();
    expect(el.getAttribute("data-state")).toBe("on");
    expect(screen.getByLabelText("Headlight on")).toBeTruthy();
  });

  it("renders the OFF state with an accessible label when the headlight is off", () => {
    wrap(<HeadlightIndicator on={false} />);
    const el = screen.getByTestId("headlight-indicator");
    expect(el.getAttribute("data-state")).toBe("off");
    expect(screen.getByLabelText("Headlight off")).toBeTruthy();
  });

  it("renders nothing when the headlight state is unknown (null)", () => {
    const { container } = wrap(<HeadlightIndicator on={null} />);
    expect(container.querySelector('[data-testid="headlight-indicator"]')).toBeNull();
  });
});
