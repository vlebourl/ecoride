import { describe, expect, it } from "vitest";
import {
  parseStateBytes,
  buildWriteCommand,
  decodeMode,
  encodeMode,
  modeIndex,
  type Super73State,
} from "../super73-ble";

describe("decodeMode", () => {
  it("decodes EU modes (offset by 4)", () => {
    expect(decodeMode(4)).toEqual({ mode: "eco", region: "eu" });
    expect(decodeMode(5)).toEqual({ mode: "tour", region: "eu" });
    expect(decodeMode(6)).toEqual({ mode: "sport", region: "eu" });
    expect(decodeMode(7)).toEqual({ mode: "race", region: "eu" });
  });

  it("decodes US modes (no offset)", () => {
    expect(decodeMode(0)).toEqual({ mode: "eco", region: "us" });
    expect(decodeMode(1)).toEqual({ mode: "tour", region: "us" });
    expect(decodeMode(2)).toEqual({ mode: "sport", region: "us" });
    expect(decodeMode(3)).toEqual({ mode: "race", region: "us" });
  });

  it("falls back to eco for out-of-range values", () => {
    expect(decodeMode(8).mode).toBe("eco");
    expect(decodeMode(255).mode).toBe("eco");
  });
});

describe("encodeMode", () => {
  it("encodes EU modes with offset 4", () => {
    expect(encodeMode("eco", "eu")).toBe(4);
    expect(encodeMode("tour", "eu")).toBe(5);
    expect(encodeMode("sport", "eu")).toBe(6);
    expect(encodeMode("race", "eu")).toBe(7);
  });

  it("encodes US modes without offset", () => {
    expect(encodeMode("eco", "us")).toBe(0);
    expect(encodeMode("tour", "us")).toBe(1);
    expect(encodeMode("sport", "us")).toBe(2);
    expect(encodeMode("race", "us")).toBe(3);
  });

  it("roundtrips correctly for all modes and regions", () => {
    for (const region of ["eu", "us"] as const) {
      for (const mode of ["eco", "tour", "sport", "race"] as const) {
        const byte = encodeMode(mode, region);
        const decoded = decodeMode(byte);
        expect(decoded.mode).toBe(mode);
        expect(decoded.region).toBe(region);
      }
    }
  });
});

describe("modeIndex", () => {
  it("returns correct indices", () => {
    expect(modeIndex("eco")).toBe(0);
    expect(modeIndex("tour")).toBe(1);
    expect(modeIndex("sport")).toBe(2);
    expect(modeIndex("race")).toBe(3);
  });
});

describe("parseStateBytes", () => {
  it("parses EU state bytes correctly", () => {
    // [3, ?, assist=2, ?, light=1, mode=6(sport EU), ...]
    const bytes = new Uint8Array([3, 0, 2, 0, 1, 6, 0, 0, 0, 0]);
    const state = parseStateBytes(bytes);
    expect(state).toEqual({ mode: "sport", assist: 2, light: true, region: "eu" });
  });

  it("parses US state bytes correctly", () => {
    // [3, ?, assist=4, ?, light=0, mode=1(tour US), ...]
    const bytes = new Uint8Array([3, 0, 4, 0, 0, 1, 0, 0, 0, 0]);
    const state = parseStateBytes(bytes);
    expect(state).toEqual({ mode: "tour", assist: 4, light: false, region: "us" });
  });

  it("clamps assist to 0-4 range", () => {
    const bytes = new Uint8Array([3, 0, 10, 0, 0, 4, 0, 0, 0, 0]);
    expect(parseStateBytes(bytes).assist).toBe(4);
  });

  it("throws on too-short buffer", () => {
    expect(() => parseStateBytes(new Uint8Array([3, 0]))).toThrow("Invalid state");
  });
});

describe("buildWriteCommand", () => {
  it("builds correct EU command", () => {
    const state: Super73State = { mode: "sport", assist: 3, light: true, region: "eu" };
    const cmd = buildWriteCommand(state);
    // [0, 209, light=1, assist=3, mode=6, 0, 0, 0, 0, 0]
    expect(Array.from(cmd)).toEqual([0, 209, 1, 3, 6, 0, 0, 0, 0, 0]);
  });

  it("builds correct US command", () => {
    const state: Super73State = { mode: "eco", assist: 0, light: false, region: "us" };
    const cmd = buildWriteCommand(state);
    expect(Array.from(cmd)).toEqual([0, 209, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("always has 10 bytes with header [0, 209]", () => {
    const state: Super73State = { mode: "race", assist: 4, light: true, region: "eu" };
    const cmd = buildWriteCommand(state);
    expect(cmd.length).toBe(10);
    expect(cmd[0]).toBe(0);
    expect(cmd[1]).toBe(209);
  });
});
