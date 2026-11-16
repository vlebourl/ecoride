import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeAlert } from "../trip/RangeAlert";
import { I18nProvider } from "@/i18n/provider";

describe("RangeAlert (#422)", () => {
  it("shows range vs distance left and switches to eco on tap", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    const onSwitchToEco = vi.fn();
    render(
      <I18nProvider>
        <RangeAlert rangeKm={4.2} remainingKm={6.25} canSwitchToEco onSwitchToEco={onSwitchToEco} />
      </I18nProvider>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Autonomie 4 km pour 6.3 km restants");
    fireEvent.click(screen.getByRole("button", { name: "Passer en eco" }));
    expect(onSwitchToEco).toHaveBeenCalledTimes(1);
  });

  it("hides the eco button once the bike is already pinned to eco", () => {
    render(
      <I18nProvider>
        <RangeAlert rangeKm={4} remainingKm={6} canSwitchToEco={false} onSwitchToEco={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
