import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountUp } from "../useCountUp";

// Minimal RAF/cAF stubs shared across tests
const rafCallbacks = new Map<number, FrameRequestCallback>();
let rafId = 0;

function stubRaf() {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      const id = ++rafId;
      rafCallbacks.set(id, cb);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      rafCallbacks.delete(id);
    }),
  );
}

function flushAllFrames(timestamp: number) {
  const cbs = [...rafCallbacks.values()];
  act(() => {
    cbs.forEach((cb) => cb(timestamp));
  });
}

describe("useCountUp", () => {
  beforeEach(() => {
    rafCallbacks.clear();
    rafId = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns target immediately when prefers-reduced-motion is active", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    stubRaf();

    const { result } = renderHook(() => useCountUp(500));
    expect(result.current).toBe(500);
    // No RAF should have been scheduled
    expect(rafCallbacks.size).toBe(0);
  });

  it("animates from previous value toward new target and reaches it at durationMs", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    stubRaf();

    // Start at target=0, then change to target=100
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 1000), {
      initialProps: { target: 0 },
    });
    expect(result.current).toBe(0);

    // Change target to 100 → triggers animation
    rerender({ target: 100 });

    // First frame: establishes startTs
    flushAllFrames(0);

    // Mid-point (500ms of 1000ms)
    flushAllFrames(500);
    const midValue = result.current;
    expect(midValue).toBeGreaterThan(0);
    expect(midValue).toBeLessThan(100);

    // Final frame at exactly durationMs
    flushAllFrames(1000);
    expect(result.current).toBe(100);
  });

  it("cancels the animation frame on unmount", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    stubRaf();

    const cancelSpy = vi.mocked(globalThis.cancelAnimationFrame);

    const { unmount } = renderHook(() => useCountUp(100, 1000));

    // Trigger animation effect by forcing a re-render with same target
    // (effect runs on mount — a RAF is scheduled)
    unmount();

    // cancelAnimationFrame should have been called
    expect(cancelSpy).toHaveBeenCalled();
  });
});
