import { describe, it, expect } from "vitest";
import {
  computeManualDurationSec,
  maxStartedAtLocal,
  clampManualStartedAtIso,
} from "../ManualEntryForm";

describe("computeManualDurationSec", () => {
  it("returns minutes * 60 when manualMinutes is provided", () => {
    expect(computeManualDurationSec("10", "30")).toBe(1800);
  });

  it("falls back to km / 15 km/h when minutes empty", () => {
    expect(computeManualDurationSec("15", "")).toBe(3600);
  });

  it("returns 0 when both fields empty or invalid", () => {
    expect(computeManualDurationSec("", "")).toBe(0);
    expect(computeManualDurationSec("abc", "")).toBe(0);
  });

  it("ignores non-positive minutes and falls back to km", () => {
    expect(computeManualDurationSec("15", "0")).toBe(3600);
    expect(computeManualDurationSec("15", "-5")).toBe(3600);
  });
});

describe("clampManualStartedAtIso (regression for endedAt-in-future bug)", () => {
  it("snaps a too-recent startedAt so endedAt does not exceed now", () => {
    const now = new Date("2026-05-06T12:00:00Z");
    // User picked 'now' but durationSec is 30min → naive endedAt would be 12:30 (future).
    const local = "2026-05-06T12:00";
    const clampedIso = clampManualStartedAtIso(local, 1800, now);
    const endedAtMs = new Date(clampedIso).getTime() + 1800 * 1000;
    expect(endedAtMs).toBeLessThanOrEqual(now.getTime());
  });

  it("preserves a clearly-past startedAt", () => {
    const now = new Date("2026-05-06T12:00:00Z");
    const local = "2026-05-04T08:30";
    const expected = new Date(local).toISOString();
    expect(clampManualStartedAtIso(local, 1800, now)).toBe(expected);
  });

  it("clamps when chosen + duration is already in the future", () => {
    const now = new Date("2026-05-06T12:00:00Z");
    // Picked 5 min ago, duration 30 min → endedAt would be in the future.
    const local = new Date(now.getTime() - 5 * 60 * 1000).toISOString().slice(0, 16);
    const clampedIso = clampManualStartedAtIso(local, 1800, now);
    expect(new Date(clampedIso).getTime() + 1800 * 1000).toBeLessThanOrEqual(now.getTime());
  });
});

describe("maxStartedAtLocal", () => {
  it("subtracts durationSec from now in the user's local timezone", () => {
    const now = new Date("2026-05-06T12:00:00Z");
    const max = maxStartedAtLocal(1800, now);
    // 30 minutes earlier (UTC), then converted to local "YYYY-MM-DDTHH:MM".
    const expected = new Date(new Date(now.getTime() - 1800 * 1000).getTime());
    const offsetMs = expected.getTimezoneOffset() * 60_000;
    expect(max).toBe(new Date(expected.getTime() - offsetMs).toISOString().slice(0, 16));
  });

  it("returns now when durationSec is 0", () => {
    const now = new Date("2026-05-06T12:00:00Z");
    const max = maxStartedAtLocal(0, now);
    const offsetMs = now.getTimezoneOffset() * 60_000;
    expect(max).toBe(new Date(now.getTime() - offsetMs).toISOString().slice(0, 16));
  });
});
