import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMapOrientation } from "../useMapOrientation";

const STORAGE_KEY = "ecoride-map-orientation";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe("useMapOrientation", () => {
  beforeEach(() => {
    storage.clear();
  });

  it('defaults to "pov" when localStorage is empty', () => {
    const { result } = renderHook(() => useMapOrientation());
    expect(result.current.orientation).toBe("pov");
  });

  it('reads an existing "north" value from localStorage on mount', () => {
    storage.set(STORAGE_KEY, "north");
    const { result } = renderHook(() => useMapOrientation());
    expect(result.current.orientation).toBe("north");
  });

  it("toggle() flips the value and writes it back to localStorage", () => {
    const { result } = renderHook(() => useMapOrientation());
    expect(result.current.orientation).toBe("pov");

    act(() => result.current.toggle());

    expect(result.current.orientation).toBe("north");
    expect(storage.get(STORAGE_KEY)).toBe("north");

    act(() => result.current.toggle());

    expect(result.current.orientation).toBe("pov");
    expect(storage.get(STORAGE_KEY)).toBe("pov");
  });
});
