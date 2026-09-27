import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const evaluateAndUnlockBadges = vi.fn().mockResolvedValue([]);
  const logAudit = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const withContext = vi.fn(() => ({ error, info: vi.fn(), warn }));
  const getFuelPrice = vi.fn().mockResolvedValue({ priceEur: 1.75 });

  return {
    select,
    selectFrom,
    selectWhere,
    insert,
    insertValues,
    evaluateAndUnlockBadges,
    logAudit,
    withContext,
    warn,
    error,
    getFuelPrice,
  };
});

vi.mock("../../db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../db/schema", () => ({
  trips: {
    userId: {},
    startedAt: {},
    distanceKm: {},
    co2SavedKg: {},
    moneySavedEur: {},
    fuelSavedL: {},
  },
  achievements: { userId: {} },
  tripPresets: { userId: {} },
  pushSubscriptions: { userId: {} },
  auditLogs: { userId: {} },
}));

vi.mock("../../db/schema/auth", () => ({
  user: { id: {}, updatedAt: {} },
  session: { userId: {} },
}));

vi.mock("../../lib/badges", () => ({
  evaluateAndUnlockBadges: mocks.evaluateAndUnlockBadges,
}));

vi.mock("../../lib/audit", () => ({
  logAudit: (...args: unknown[]) => mocks.logAudit(...args),
}));

vi.mock("../../lib/fuel-price", () => ({ getFuelPrice: mocks.getFuelPrice }));

vi.mock("../../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withContext: mocks.withContext,
  },
}));

import { usersRouter } from "../users.routes";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/user", usersRouter);
  return app;
}

function sampleTrip(overrides: Record<string, unknown> = {}) {
  return {
    distanceKm: 12.345,
    durationSec: 1800,
    co2SavedKg: 1.617,
    moneySavedEur: 2.34,
    fuelSavedL: 0.7,
    fuelPriceEur: 1.82,
    startedAt: "2026-01-01T10:00:00.000Z",
    endedAt: "2026-01-01T10:30:00.000Z",
    gpsPoints: null,
    idempotencyKey: null,
    ...overrides,
  };
}

describe("POST /user/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectWhere.mockResolvedValue([]);
  });

  it("recalculates historical savings from server-side values", async () => {
    const res = await buildApp().request("/user/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trips: [sampleTrip()] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { imported: number; skipped: number } };
    expect(body.data).toEqual({ imported: 1, skipped: 0 });

    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    const inserted = mocks.insertValues.mock.calls[0]![0][0];
    expect(inserted).toMatchObject({
      userId: "user-1",
      distanceKm: 12.345,
      durationSec: 1800,
      co2SavedKg: 1.996,
      moneySavedEur: 1.51,
      fuelSavedL: 0.864,
      fuelPriceEur: 1.75,
    });
    expect(inserted.startedAt).toBeInstanceOf(Date);
    expect(inserted.startedAt.toISOString()).toBe("2026-01-01T10:00:00.000Z");
  });

  it("does not trust imported savings or fuel price", async () => {
    const res = await buildApp().request("/user/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trips: [
          sampleTrip({
            co2SavedKg: 1_000_000,
            moneySavedEur: 1_000_000,
            fuelSavedL: 1_000_000,
            fuelPriceEur: 1_000_000,
          }),
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(mocks.insertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        co2SavedKg: expect.any(Number),
        moneySavedEur: expect.any(Number),
        fuelSavedL: expect.any(Number),
        fuelPriceEur: 1.75,
      }),
    ]);
    const inserted = mocks.insertValues.mock.calls[0]![0][0];
    expect(inserted.co2SavedKg).toBeLessThan(10);
    expect(inserted.moneySavedEur).toBeLessThan(10);
    expect(inserted.fuelSavedL).toBeLessThan(10);
  });

  it("skips trips whose startedAt already exists for this user", async () => {
    mocks.selectWhere.mockResolvedValueOnce([{ startedAt: new Date("2026-01-01T10:00:00.000Z") }]);

    const res = await buildApp().request("/user/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trips: [
          sampleTrip(),
          sampleTrip({
            startedAt: "2026-01-02T10:00:00.000Z",
            endedAt: "2026-01-02T10:30:00.000Z",
          }),
        ],
      }),
    });

    const body = (await res.json()) as { data: { imported: number; skipped: number } };
    expect(body.data).toEqual({ imported: 1, skipped: 1 });
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    const inserted = mocks.insertValues.mock.calls[0]![0];
    expect(inserted).toHaveLength(1);
    expect(inserted[0].startedAt.toISOString()).toBe("2026-01-02T10:00:00.000Z");
  });

  it("skips an imported key already attached to another trip", async () => {
    mocks.selectWhere.mockResolvedValueOnce([
      {
        startedAt: new Date("2026-01-01T09:00:00.000Z"),
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      },
    ]);
    const res = await buildApp().request("/user/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trips: [
          sampleTrip({
            idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
          }),
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { imported: 0, skipped: 1 } });
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith("trip_write_outcome", {
      source: "import",
      outcome: "import_skipped",
      category: "expected",
      count: 1,
    });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("550e8400");
  });

  it("rejects invalid payloads (missing required field)", async () => {
    const res = await buildApp().request("/user/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trips: [{ ...sampleTrip(), distanceKm: undefined }],
      }),
    });

    expect(res.status).toBe(400);
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith("trip_write_outcome", {
      source: "import",
      outcome: "validation_rejected",
      category: "expected",
      count: 1,
    });
  });

  it("handles an empty trips array without hitting the DB", async () => {
    const res = await buildApp().request("/user/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trips: [] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { imported: number; skipped: number } };
    expect(body.data).toEqual({ imported: 0, skipped: 0 });
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.evaluateAndUnlockBadges).not.toHaveBeenCalled();
  });
});

describe("GET /user/export", () => {
  it("includes presets, push subscriptions, audit logs and sessions", async () => {
    mocks.selectWhere.mockResolvedValue([]);
    const res = await buildApp().request("/user/export");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      tripPresets: [],
      pushSubscriptions: [],
      auditLogs: [],
      sessions: [],
    });
  });
});
