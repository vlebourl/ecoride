import { describe, it, expect } from "vitest";
import { createTripSchema } from "../trips";

function validTrip(overrides: Record<string, unknown> = {}) {
  return {
    distanceKm: 10,
    durationSec: 1800,
    startedAt: "2025-06-15T08:00:00Z",
    endedAt: "2025-06-15T08:30:00Z",
    ...overrides,
  };
}

describe("createTripSchema", () => {
  describe("valid inputs", () => {
    it("accepts a minimal valid trip", () => {
      const result = createTripSchema.safeParse(validTrip());
      expect(result.success).toBe(true);
    });

    it("accepts trip with gpsPoints", () => {
      const result = createTripSchema.safeParse(
        validTrip({
          gpsPoints: [
            { lat: 48.8566, lng: 2.3522, ts: 1718438400000 },
            { lat: 48.857, lng: 2.353, ts: 1718438410000 },
          ],
        }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts trip with null gpsPoints", () => {
      const result = createTripSchema.safeParse(
        validTrip({ gpsPoints: null }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts trip with idempotencyKey", () => {
      const result = createTripSchema.safeParse(
        validTrip({ idempotencyKey: "550e8400-e29b-41d4-a716-446655440000" }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts trip with no idempotencyKey", () => {
      const result = createTripSchema.safeParse(validTrip());
      expect(result.success).toBe(true);
    });

    it("accepts distanceKm exactly 500 (max boundary)", () => {
      const result = createTripSchema.safeParse(
        validTrip({ distanceKm: 500 }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts durationSec exactly 1 (min boundary)", () => {
      const result = createTripSchema.safeParse(
        validTrip({ durationSec: 1 }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts durationSec exactly 86400 (max boundary)", () => {
      const result = createTripSchema.safeParse(
        validTrip({ durationSec: 86400 }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("distanceKm validation", () => {
    it("rejects distanceKm > 500", () => {
      const result = createTripSchema.safeParse(
        validTrip({ distanceKm: 501 }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects distanceKm = 0", () => {
      const result = createTripSchema.safeParse(
        validTrip({ distanceKm: 0 }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects negative distanceKm", () => {
      const result = createTripSchema.safeParse(
        validTrip({ distanceKm: -1 }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("durationSec validation", () => {
    it("rejects durationSec < 1", () => {
      const result = createTripSchema.safeParse(
        validTrip({ durationSec: 0 }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects negative durationSec", () => {
      const result = createTripSchema.safeParse(
        validTrip({ durationSec: -5 }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects durationSec > 86400", () => {
      const result = createTripSchema.safeParse(
        validTrip({ durationSec: 86401 }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects non-integer durationSec", () => {
      const result = createTripSchema.safeParse(
        validTrip({ durationSec: 1800.5 }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("startedAt / endedAt validation", () => {
    it("rejects when startedAt >= endedAt", () => {
      const result = createTripSchema.safeParse(
        validTrip({
          startedAt: "2025-06-15T09:00:00Z",
          endedAt: "2025-06-15T08:00:00Z",
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join("."));
        expect(paths).toContain("startedAt");
      }
    });

    it("rejects when startedAt equals endedAt", () => {
      const result = createTripSchema.safeParse(
        validTrip({
          startedAt: "2025-06-15T08:00:00Z",
          endedAt: "2025-06-15T08:00:00Z",
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects invalid datetime strings", () => {
      const result = createTripSchema.safeParse(
        validTrip({ startedAt: "not-a-date" }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("gpsPoints validation", () => {
    it("rejects gpsPoints array with > 10000 items", () => {
      const points = Array.from({ length: 10001 }, (_, i) => ({
        lat: 48.8566,
        lng: 2.3522,
        ts: 1718438400000 + i,
      }));
      const result = createTripSchema.safeParse(
        validTrip({ gpsPoints: points }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts gpsPoints array with exactly 10000 items", () => {
      const points = Array.from({ length: 10000 }, (_, i) => ({
        lat: 48.8566,
        lng: 2.3522,
        ts: 1718438400000 + i,
      }));
      const result = createTripSchema.safeParse(
        validTrip({ gpsPoints: points }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects gpsPoint with lat out of range", () => {
      const result = createTripSchema.safeParse(
        validTrip({
          gpsPoints: [{ lat: 91, lng: 2.3522, ts: 1718438400000 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects gpsPoint with lat below -90", () => {
      const result = createTripSchema.safeParse(
        validTrip({
          gpsPoints: [{ lat: -91, lng: 2.3522, ts: 1718438400000 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects gpsPoint with lng out of range", () => {
      const result = createTripSchema.safeParse(
        validTrip({
          gpsPoints: [{ lat: 48.8566, lng: 181, ts: 1718438400000 }],
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects gpsPoint with lng below -180", () => {
      const result = createTripSchema.safeParse(
        validTrip({
          gpsPoints: [{ lat: 48.8566, lng: -181, ts: 1718438400000 }],
        }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("idempotencyKey validation", () => {
    it("rejects non-UUID idempotencyKey", () => {
      const result = createTripSchema.safeParse(
        validTrip({ idempotencyKey: "not-a-uuid" }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts valid UUID v4", () => {
      const result = createTripSchema.safeParse(
        validTrip({ idempotencyKey: "f47ac10b-58cc-4372-a567-0e02b2c3d479" }),
      );
      expect(result.success).toBe(true);
    });
  });
});
