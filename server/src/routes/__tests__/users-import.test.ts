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
  const withContext = vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));

  return {
    select,
    selectFrom,
    selectWhere,
    insert,
    insertValues,
    evaluateAndUnlockBadges,
    logAudit,
    withContext,
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
}));

vi.mock("../../db/schema/auth", () => ({
  user: { id: {}, updatedAt: {} },
}));

vi.mock("../../lib/badges", () => ({
  evaluateAndUnlockBadges: mocks.evaluateAndUnlockBadges,
}));

vi.mock("../../lib/audit", () => ({
  logAudit: (...args: unknown[]) => mocks.logAudit(...args),
}));

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

  it("preserves historical co2/money/fuel values as-is (no recalculation)", async () => {
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
      co2SavedKg: 1.617,
      moneySavedEur: 2.34,
      fuelSavedL: 0.7,
      fuelPriceEur: 1.82,
    });
    expect(inserted.startedAt).toBeInstanceOf(Date);
    expect(inserted.startedAt.toISOString()).toBe("2026-01-01T10:00:00.000Z");
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
