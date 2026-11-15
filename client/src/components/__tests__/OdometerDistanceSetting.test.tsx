import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OdometerDistanceSetting } from "../OdometerDistanceSetting";
import { I18nProvider } from "@/i18n/provider";
import { isOdometerDistanceEnabled } from "@/lib/trip-odometer";

const renderSetting = () =>
  render(
    <I18nProvider>
      <OdometerDistanceSetting />
    </I18nProvider>,
  );

describe("OdometerDistanceSetting", () => {
  // Node's own experimental localStorage shadows jsdom's and is unusable here.
  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is off until the rider turns it on, and remembers the choice", () => {
    const first = renderSetting();
    const toggle = screen.getByRole("switch", { name: "Utiliser l'odomètre du vélo" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(isOdometerDistanceEnabled()).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(isOdometerDistanceEnabled()).toBe(true);

    // Coming back to the page later shows the stored choice.
    first.unmount();
    renderSetting();
    const again = screen.getByRole("switch", { name: "Utiliser l'odomètre du vélo" });
    expect(again.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(again);
    expect(isOdometerDistanceEnabled()).toBe(false);
  });
});
