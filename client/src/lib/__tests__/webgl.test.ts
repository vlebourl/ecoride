import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("isWebGLSupported", () => {
  it("returns true and caches the successful capability check", async () => {
    const getContext = vi.fn((kind: string) => (kind === "webgl2" ? { kind } : null));
    const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue({
      getContext,
    } as unknown as HTMLCanvasElement);

    const { isWebGLSupported } = await import("../webgl");

    expect(isWebGLSupported()).toBe(true);
    expect(isWebGLSupported()).toBe(true);
    expect(createElementSpy).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  it("returns false when the browser throws while creating a context", async () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("no canvas");
    });

    const { isWebGLSupported } = await import("../webgl");

    expect(isWebGLSupported()).toBe(false);
  });
});
