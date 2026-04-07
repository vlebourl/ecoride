import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, isValidIanaTimezone, normalizeTimezone } from "../timezone";

describe("timezone helpers", () => {
  it("accepts valid IANA timezone names", () => {
    expect(isValidIanaTimezone("Europe/Paris")).toBe(true);
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
  });

  it("rejects invalid timezone names", () => {
    expect(isValidIanaTimezone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidIanaTimezone("not-a-timezone")).toBe(false);
  });

  it("normalizes missing or invalid values to UTC", () => {
    expect(normalizeTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
    expect(normalizeTimezone(null)).toBe(DEFAULT_TIMEZONE);
    expect(normalizeTimezone("bad/timezone")).toBe(DEFAULT_TIMEZONE);
  });

  it("preserves valid timezone values", () => {
    expect(normalizeTimezone("Europe/Paris")).toBe("Europe/Paris");
  });
});
