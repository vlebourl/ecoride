import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ select, insert, execute: vi.fn() }),
  );
  const evaluateAndUnlockBadges = vi.fn().mockResolvedValue([]);
  const logAudit = vi.fn();
  const withContext = vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));
  const getFuelPrice = vi.fn().mockResolvedValue({ priceEur: 1.75 });

  return {
    select,
    selectFrom,
    selectWhere,
    insert,
    insertValues,
    transaction,
    evaluateAndUnlockBadges,
    logAudit,
    withContext,
    getFuelPrice,
  };
});

vi.mock("../../db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    transaction: mocks.transaction,
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

  it("waits for an in-flight trip creation on the same key, then skips its committed row", async () => {
    vi.clearAllMocks();
    const key = "550e8400-e29b-41d4-a716-446655440000";
    const rows: Array<{ startedAt: Date; idempotencyKey: string }> = [];
    let notifyRead: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => {
      notifyRead = resolve;
    });
    mocks.selectWhere.mockImplementation(async () => {
      notifyRead?.();
      return [...rows];
    });
    mocks.insertValues.mockImplementation(
      async (values: Array<{ startedAt: Date; idempotencyKey: string }>) => {
        for (const value of values) {
          if (rows.some((row) => row.idempotencyKey === value.idempotencyKey))
            throw Object.assign(new Error("duplicate trip key"), { code: "23505" });
          rows.push({ startedAt: value.startedAt, idempotencyKey: value.idempotencyKey });
        }
      },
    );

    let releaseLock: (() => void) | undefined;
    let lockTail = Promise.resolve();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      let unlock: (() => void) | undefined;
      const tx = {
        select: mocks.select,
        insert: mocks.insert,
        execute: async () => {
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          await previous;
        },
      };
      try {
        return await callback(tx);
      } finally {
        unlock?.();
      }
    });
    const creationHasLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let confirmCreationLock: (() => void) | undefined;
    const creationLocked = new Promise<void>((resolve) => {
      confirmCreationLock = resolve;
    });
    const creation = mocks.transaction(async (tx: unknown) => {
      await (tx as { execute: () => Promise<void> }).execute();
      confirmCreationLock?.();
      await creationHasLock;
      if (rows.some((row) => row.idempotencyKey === key)) throw new Error("duplicate trip key");
      rows.push({ startedAt: new Date("2026-01-01T10:00:00.000Z"), idempotencyKey: key });
    });
    await creationLocked;
    const importRequest = buildApp().request("/user/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trips: [sampleTrip({ idempotencyKey: key })] }),
    });
    await Promise.race([readStarted, new Promise<void>((resolve) => setTimeout(resolve, 20))]);
    releaseLock?.();
    const [created, imported] = await Promise.allSettled([creation, importRequest]);
    expect(created.status).toBe("fulfilled");
    expect(imported.status).toBe("fulfilled");
    if (imported.status === "fulfilled") {
      expect(imported.value.status).toBe(200);
      expect(await imported.value.json()).toMatchObject({ data: { imported: 0, skipped: 1 } });
    }
    expect(rows).toHaveLength(1);
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

  it("exports session metadata without a usable session token", async () => {
    mocks.selectWhere.mockReset().mockResolvedValue([]);
    mocks.selectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.selectWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.selectWhere.mockResolvedValueOnce([
      {
        id: "session-1",
        userId: "user-1",
        token: "live-session-secret",
        ipAddress: "192.0.2.1",
        userAgent: "test-browser",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-02T00:00:00.000Z"),
        expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    ]);

    const res = await buildApp().request("/user/export");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: Array<Record<string, unknown>> };
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      id: "session-1",
      ipAddress: "192.0.2.1",
      userAgent: "test-browser",
      expiresAt: "2026-10-01T00:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("live-session-secret");
    expect(body.sessions[0]).not.toHaveProperty("token");
  });
});

describe("POST /user/import key validation", () => {
  it.each([
    { label: "wrong format", key: "not-a-uuid" },
    { label: "excessive length", key: "x".repeat(10_000) },
  ])("rejects $label before DB access", async ({ key: idempotencyKey }) => {
    vi.clearAllMocks();
    const res = await buildApp().request("/user/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trips: [sampleTrip({ idempotencyKey })] }),
    });
    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
