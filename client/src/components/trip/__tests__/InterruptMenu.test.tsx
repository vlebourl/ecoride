import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InterruptMenu } from "../InterruptMenu";

describe("InterruptMenu", () => {
  const baseProps = {
    onResume: vi.fn(),
    onStop: vi.fn(),
    onAbandon: vi.fn(),
    onClose: vi.fn(),
  };

  it("disables Terminer when canStop is false", () => {
    render(<InterruptMenu {...baseProps} canStop={false} />);
    const btn = screen.getByRole("button", { name: "Terminer" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Terminer when canStop is true", () => {
    render(<InterruptMenu {...baseProps} canStop={true} />);
    const btn = screen.getByRole("button", { name: "Terminer" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
