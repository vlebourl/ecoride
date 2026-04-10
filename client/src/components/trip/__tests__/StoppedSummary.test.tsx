import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoppedSummary } from "../StoppedSummary";
import { I18nProvider } from "@/i18n/provider";

const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

beforeEach(() => {
  // Force French locale so existing assertions on FR strings keep working
  // regardless of host navigator.language or bun-provided localStorage.
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
});

describe("StoppedSummary", () => {
  const baseProps = {
    co2Saved: 0,
    elapsed: 0,
    formatTime: (s: number) => `${s}s`,
    onAbandon: vi.fn(),
    onSave: vi.fn(),
    isSaving: false,
    sessionPersistFailed: false,
    saveError: "",
  };

  it("disables Enregistrer when distance is zero", () => {
    renderWithI18n(<StoppedSummary {...baseProps} distance={0} />);
    const btn = screen.getByRole("button", { name: /Enregistrer/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/trop court/i)).toBeTruthy();
  });

  it("disables Enregistrer when distance is below 0.01 km", () => {
    renderWithI18n(<StoppedSummary {...baseProps} distance={0.005} />);
    const btn = screen.getByRole("button", { name: /Enregistrer/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Enregistrer when distance is at threshold", () => {
    renderWithI18n(<StoppedSummary {...baseProps} distance={0.01} />);
    const btn = screen.getByRole("button", { name: /Enregistrer/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
