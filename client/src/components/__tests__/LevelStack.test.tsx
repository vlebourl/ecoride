import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LevelStack } from "../trip/LevelStack";

function filledCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-filled="true"]').length;
}

describe("LevelStack", () => {
  it("fills cumulatively from the bottom for level 2", () => {
    const { container } = render(
      <LevelStack level={2} activeColor="bg-primary" label="Assist" ariaLabel="Assist 2/4" />,
    );
    expect(filledCount(container)).toBe(2);
  });

  it("renders no filled cell at level 0", () => {
    const { container } = render(
      <LevelStack level={0} activeColor="bg-primary" label="Assist" ariaLabel="Assist 0/4" />,
    );
    expect(filledCount(container)).toBe(0);
  });

  it("fills all four cells at level 4 (and clamps above)", () => {
    const { container } = render(
      <LevelStack level={9} activeColor="bg-primary" label="Assist" ariaLabel="Assist 4/4" />,
    );
    expect(filledCount(container)).toBe(4);
  });
});
