import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  const selectResultQueue: unknown[] = [];
  const selectWhereQueue: unknown[] = [];
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const delWhere = vi.fn();
  const del = vi.fn(() => ({ where: delWhere }));

  const makeSelectChain = () => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve(selectResultQueue.shift() ?? [])),
        then: (resolve: (value: unknown[]) => unknown) =>
          resolve((selectWhereQueue.shift() ?? []) as unknown[]),
        catch: () => Promise.resolve(selectWhereQueue.shift() ?? []),
      })),
      orderBy: vi.fn(() => Promise.resolve(selectResultQueue.shift() ?? [])),
    })),
  });

  return {
    selectResultQueue,
    selectWhereQueue,
    insertReturning,
    insertValues,
    insert,
    delWhere,
    del,
    makeSelectChain,
  };
});

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => mocks.makeSelectChain()),
    insert: mocks.insert,
    delete: mocks.del,
  },
}));

vi.mock("../../db/schema", () => ({
  tripPresets: {
    id: {},
    userId: {},
    updatedAt: {},
  },
  trips: {
    id: {},
    userId: {},
  },
}));

import { tripPresetsRouter } from "../trip-presets.routes";

function buildApp(userId = "user-1") {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/trip-presets", tripPresetsRouter);
  return app;
}

describe("trip-presets routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResultQueue.length = 0;
    mocks.selectWhereQueue.length = 0;
  });

  it("lists the current user's trip presets in reverse update order", async () => {
    mocks.selectResultQueue.push([
      {
        id: "preset-1",
        userId: "user-1",
        label: "Domicile → Travail",
        distanceKm: 12.5,
        durationSec: 1800,
        gpsPoints: null,
        sourceTripId: null,
        createdAt: new Date("2026-04-08T09:00:00.000Z"),
        updatedAt: new Date("2026-04-08T10:00:00.000Z"),
      },
    ]);

    const res = await buildApp().request("/trip-presets");
    const body = (await res.json()) as {
      ok: boolean;
      data: { tripPresets: Array<{ id: string; updatedAt: string }> };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.tripPresets).toEqual([
      expect.objectContaining({
        id: "preset-1",
        updatedAt: "2026-04-08T10:00:00.000Z",
      }),
    ]);
  });

  it("creates a manual trip preset", async () => {
    mocks.insertReturning.mockResolvedValueOnce([
      {
        id: "preset-2",
        userId: "user-1",
        label: "Marché",
        distanceKm: 4.2,
        durationSec: null,
        gpsPoints: null,
        sourceTripId: null,
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        updatedAt: new Date("2026-04-08T10:00:00.000Z"),
      },
    ]);

    const res = await buildApp().request("/trip-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "  Marché  ",
        distanceKm: 4.2,
        durationSec: null,
        gpsPoints: null,
      }),
    });
    const body = (await res.json()) as { ok: boolean; data: { tripPreset: { label: string } } };

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.tripPreset.label).toBe("Marché");
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        label: "Marché",
        distanceKm: 4.2,
      }),
    );
  });

  it("creates a trip preset from an existing trip", async () => {
    mocks.selectWhereQueue.push([
      {
        id: "trip-1",
        userId: "user-1",
        distanceKm: 9.8,
        durationSec: 2100,
        gpsPoints: [{ lat: 48.8, lng: 2.3, ts: 1 }],
      },
    ]);
    mocks.insertReturning.mockResolvedValueOnce([
      {
        id: "preset-3",
        userId: "user-1",
        label: "Bureau",
        distanceKm: 9.8,
        durationSec: 2100,
        gpsPoints: [{ lat: 48.8, lng: 2.3, ts: 1 }],
        sourceTripId: "trip-1",
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        updatedAt: new Date("2026-04-08T10:00:00.000Z"),
      },
    ]);

    const res = await buildApp().request(
      "/trip-presets/from-trip/11111111-1111-4111-8111-111111111111",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: " Bureau " }),
      },
    );
    const body = (await res.json()) as {
      ok: boolean;
      data: { tripPreset: { sourceTripId: string | null } };
    };

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.tripPreset.sourceTripId).toBe("trip-1");
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Bureau",
        sourceTripId: "trip-1",
        distanceKm: 9.8,
      }),
    );
  });

  it("forbids exporting another user's trip", async () => {
    mocks.selectWhereQueue.push([
      {
        id: "trip-1",
        userId: "user-2",
        distanceKm: 9.8,
        durationSec: 2100,
        gpsPoints: null,
      },
    ]);

    const res = await buildApp().request(
      "/trip-presets/from-trip/11111111-1111-4111-8111-111111111111",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Interdit" }),
      },
    );

    expect(res.status).toBe(403);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("deletes only the owner's trip preset", async () => {
    mocks.selectWhereQueue.push([
      {
        id: "preset-9",
        userId: "user-1",
        label: "Maison",
        distanceKm: 2.3,
        durationSec: 600,
        gpsPoints: null,
        sourceTripId: null,
        createdAt: new Date("2026-04-08T10:00:00.000Z"),
        updatedAt: new Date("2026-04-08T10:00:00.000Z"),
      },
    ]);
    mocks.delWhere.mockResolvedValueOnce(undefined);

    const res = await buildApp().request("/trip-presets/11111111-1111-4111-8111-111111111111", {
      method: "DELETE",
    });
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.delWhere).toHaveBeenCalledOnce();
  });
});
