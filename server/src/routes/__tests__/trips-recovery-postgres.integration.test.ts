import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => ({
  evaluateBadges: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../lib/badges", () => ({
  evaluateAndUnlockBadges: mocks.evaluateBadges,
  reevaluateBadges: vi.fn(),
}));
vi.mock("../../lib/fuel-price", () => ({
  getFuelPrice: vi.fn().mockResolvedValue({ priceEur: 1.75 }),
}));
vi.mock("../../lib/leaderboard-notifications", () => ({
  checkLeaderboardChanges: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../lib/push", () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));

describe.skipIf(!process.env.TEST_DATABASE_URL)("trip recovery on PostgreSQL", () => {
  it("does not dispatch invalid data, then replays a committed trip after a response failure", async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const [{ db }, { user, trips }, { tripsRouter }, { eq, and }] = await Promise.all([
      import("../../db"),
      import("../../db/schema"),
      import("../trips.routes"),
      import("drizzle-orm"),
    ]);
    const suffix = crypto.randomUUID();
    const userId = `recovery-${suffix}`;
    const key = crypto.randomUUID();
    const makeApp = () => {
      const app = new Hono<AuthEnv>();
      app.use("*", async (c, next) => {
        c.set("user", { id: userId } as AuthEnv["Variables"]["user"]);
        await next();
      });
      app.route("/trips", tripsRouter);
      return app;
    };
    const post = (app: Hono<AuthEnv>, distanceKm: number) =>
      app.request("/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceKm,
          durationSec: 600,
          startedAt: "2026-09-21T10:00:00Z",
          endedAt: "2026-09-21T10:10:00Z",
          idempotencyKey: key,
        }),
      });
    await db
      .insert(user)
      .values({ id: userId, name: "Recovery", email: `recovery-${suffix}@example.test` });
    try {
      expect((await post(makeApp(), -1)).status).toBe(400);
      expect(await db.select().from(trips).where(eq(trips.userId, userId))).toHaveLength(0);

      mocks.evaluateBadges.mockRejectedValueOnce(new Error("crash after commit"));
      expect((await post(makeApp(), 5)).status).toBe(500);
      const accepted = await db
        .select()
        .from(trips)
        .where(and(eq(trips.userId, userId), eq(trips.idempotencyKey, key)));
      expect(accepted).toHaveLength(1);

      // A new app instance represents a restarted process reading persisted state.
      const retry = await post(makeApp(), 5);
      expect(retry.status).toBe(200);
      const body = (await retry.json()) as { data: { trip: { id: string } } };
      expect(body.data.trip.id).toBe(accepted[0]!.id);
      expect(await db.select().from(trips).where(eq(trips.userId, userId))).toHaveLength(1);
      expect(mocks.evaluateBadges).toHaveBeenCalledTimes(2);

      const normal = await makeApp().request("/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceKm: 5,
          durationSec: 600,
          startedAt: "2026-09-22T10:00:00Z",
          endedAt: "2026-09-22T10:10:00Z",
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      expect(normal.status).toBe(201);
      expect(await db.select().from(trips).where(eq(trips.userId, userId))).toHaveLength(2);
    } finally {
      await db.delete(user).where(eq(user.id, userId));
    }
  });

  it("serializes a parallel import and POST, then skips the persisted row after restart", async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const [{ db }, { user, trips }, { tripsRouter }, { usersRouter }, { eq, and }] =
      await Promise.all([
        import("../../db"),
        import("../../db/schema"),
        import("../trips.routes"),
        import("../users.routes"),
        import("drizzle-orm"),
      ]);
    const suffix = crypto.randomUUID();
    const userId = `import-race-${suffix}`;
    const key = crypto.randomUUID();
    const startedAt = "2026-09-23T10:00:00.000Z";
    const endedAt = "2026-09-23T10:10:00.000Z";
    const makeApp = () => {
      const app = new Hono<AuthEnv>();
      app.use("*", async (c, next) => {
        c.set("user", { id: userId } as AuthEnv["Variables"]["user"]);
        await next();
      });
      app.route("/trips", tripsRouter);
      app.route("/user", usersRouter);
      return app;
    };
    const importedTrip = {
      distanceKm: 5,
      durationSec: 600,
      co2SavedKg: 0,
      moneySavedEur: 0,
      fuelSavedL: 0,
      startedAt,
      endedAt,
      idempotencyKey: key,
    };
    const postImport = (app: Hono<AuthEnv>, idempotencyKey: string = key) =>
      app.request("/user/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trips: [{ ...importedTrip, idempotencyKey }] }),
      });
    const postTrip = (app: Hono<AuthEnv>) =>
      app.request("/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceKm: 5,
          durationSec: 600,
          startedAt,
          endedAt,
          idempotencyKey: key,
        }),
      });
    await db
      .insert(user)
      .values({ id: userId, name: "Import race", email: `import-${suffix}@example.test` });
    try {
      expect((await postImport(makeApp(), "invalid-key")).status).toBe(400);
      expect(await db.select().from(trips).where(eq(trips.userId, userId))).toHaveLength(0);

      const [createResponse, importResponse] = await Promise.all([
        postTrip(makeApp()),
        postImport(makeApp()),
      ]);
      expect([200, 201]).toContain(createResponse.status);
      expect(importResponse.status).toBe(200);
      const saved = await db
        .select()
        .from(trips)
        .where(and(eq(trips.userId, userId), eq(trips.idempotencyKey, key)));
      expect(saved).toHaveLength(1);

      // A fresh app instance must read the committed row and skip it.
      const retry = await postImport(makeApp());
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ data: { imported: 0, skipped: 1 } });
      expect(await db.select().from(trips).where(eq(trips.userId, userId))).toHaveLength(1);

      // Badge processing can fail after the import commits; the accepted row
      // remains durable and a retry through a fresh app does not duplicate it.
      const secondKey = crypto.randomUUID();
      const secondTrip = {
        ...importedTrip,
        idempotencyKey: secondKey,
        startedAt: "2026-09-24T10:00:00.000Z",
        endedAt: "2026-09-24T10:10:00.000Z",
      };
      mocks.evaluateBadges.mockRejectedValueOnce(new Error("badge processing failed after import"));
      const importSecond = (app: Hono<AuthEnv>) =>
        app.request("/user/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trips: [secondTrip] }),
        });
      expect((await importSecond(makeApp())).status).toBe(200);
      expect(
        await db
          .select()
          .from(trips)
          .where(and(eq(trips.userId, userId), eq(trips.idempotencyKey, secondKey))),
      ).toHaveLength(1);
      const secondRetry = await importSecond(makeApp());
      expect(await secondRetry.json()).toMatchObject({ data: { imported: 0, skipped: 1 } });
      expect(await db.select().from(trips).where(eq(trips.userId, userId))).toHaveLength(2);
    } finally {
      await db.delete(user).where(eq(user.id, userId));
    }
  });
});
