import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { useSwipeNavigation } from "../useSwipeNavigation";

function wrapper(initialEntry: string) {
  return function MemoryWrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

function makeTouchEvent({
  target,
  touches,
  changedTouches = touches,
}: {
  target: { closest: (selector: string) => Element | null };
  touches: Array<{ clientX: number; clientY: number }>;
  changedTouches?: Array<{ clientX: number; clientY: number }>;
}) {
  return {
    target,
    touches,
    changedTouches,
  } as unknown as React.TouchEvent;
}

describe("useSwipeNavigation", () => {
  it("navigates to the next tab on a left swipe", () => {
    const { result } = renderHook(
      () => ({ swipe: useSwipeNavigation(), location: useLocation() }),
      { wrapper: wrapper("/") },
    );

    const target = { closest: () => null };

    act(() => {
      result.current.swipe.onTouchStart(
        makeTouchEvent({ target, touches: [{ clientX: 220, clientY: 100 }] }),
      );
      result.current.swipe.onTouchMove(
        makeTouchEvent({ target, touches: [{ clientX: 110, clientY: 110 }] }),
      );
      result.current.swipe.onTouchEnd(
        makeTouchEvent({ target, touches: [], changedTouches: [{ clientX: 110, clientY: 110 }] }),
      );
    });

    expect(result.current.swipe.direction).toBe("left");
    expect(result.current.swipe.isAnimating).toBe(true);
    expect(result.current.location.pathname).toBe("/trip");
  });

  it("ignores touches that start inside a no-swipe element", () => {
    const { result } = renderHook(() => useSwipeNavigation(), {
      wrapper: wrapper("/stats"),
    });

    const ignoredTarget = {
      closest: (selector: string) => (selector.includes("data-no-swipe") ? ({} as Element) : null),
    };

    act(() => {
      result.current.onTouchStart(
        makeTouchEvent({ target: ignoredTarget, touches: [{ clientX: 200, clientY: 100 }] }),
      );
      result.current.onTouchMove(
        makeTouchEvent({ target: ignoredTarget, touches: [{ clientX: 60, clientY: 100 }] }),
      );
      result.current.onTouchEnd(
        makeTouchEvent({
          target: ignoredTarget,
          touches: [],
          changedTouches: [{ clientX: 60, clientY: 100 }],
        }),
      );
    });

    expect(result.current.dragX).toBe(0);
    expect(result.current.direction).toBeNull();
    expect(result.current.isAnimating).toBe(false);
  });

  it("locks vertical drags and does not navigate", () => {
    const { result } = renderHook(
      () => ({ swipe: useSwipeNavigation(), location: useLocation() }),
      { wrapper: wrapper("/stats") },
    );

    const target = { closest: () => null };

    act(() => {
      result.current.swipe.onTouchStart(
        makeTouchEvent({ target, touches: [{ clientX: 120, clientY: 120 }] }),
      );
      result.current.swipe.onTouchMove(
        makeTouchEvent({ target, touches: [{ clientX: 130, clientY: 220 }] }),
      );
      result.current.swipe.onTouchEnd(
        makeTouchEvent({ target, touches: [], changedTouches: [{ clientX: 130, clientY: 220 }] }),
      );
    });

    expect(result.current.swipe.dragX).toBe(0);
    expect(result.current.swipe.direction).toBeNull();
    expect(result.current.location.pathname).toBe("/stats");
  });
});
