import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InterruptMenu } from "../InterruptMenu";
import { I18nProvider } from "@/i18n/provider";

const renderWithI18n = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

beforeEach(() => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
});

describe("InterruptMenu", () => {
  const baseProps = {
    onResume: vi.fn(),
    onStop: vi.fn(),
    onAbandon: vi.fn(),
    onClose: vi.fn(),
  };

  it("disables Enregistrer when canStop is false", () => {
    renderWithI18n(<InterruptMenu {...baseProps} canStop={false} />);
    const btn = screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Enregistrer when canStop is true", () => {
    renderWithI18n(<InterruptMenu {...baseProps} canStop={true} />);
    const btn = screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("renders Enregistrer as a positive secondary action distinct from Reprendre", () => {
    renderWithI18n(<InterruptMenu {...baseProps} canStop={true} />);

    const resume = screen.getByRole("button", { name: "Reprendre" });
    const save = screen.getByRole("button", { name: "Enregistrer" });

    expect(resume.className).toContain("bg-primary");
    expect(resume.className).toContain("text-bg");
    expect(save.className).toContain("border-primary/40");
    expect(save.className).toContain("bg-primary/10");
    expect(save.className).toContain("text-primary-light");
    expect(save.className).not.toContain("bg-primary ");
    expect(save.className).not.toContain("bg-surface-high");
  });
});
