import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

// Run with TEST_DATABASE_URL pointing at a disposable migrated PostgreSQL database.
describe.skipIf(!process.env.TEST_DATABASE_URL)("leaderboard and badges on PostgreSQL", () => {
  it("orders speed before limit, handles riders without trips and evaluates badge SQL", async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const [{ db }, { user, trips }, { leaderboardRouter }, { collectUserStats }] =
      await Promise.all([
        import("../../db"),
        import("../../db/schema"),
        import("../leaderboard.routes"),
        import("../../lib/badges"),
      ]);
    const suffix = crypto.randomUUID();
    const slowId = `slow-${suffix}`;
    const fastId = `fast-${suffix}`;
    const idleId = `idle-${suffix}`;
    await db.insert(user).values([
      { id: slowId, name: "Slow", email: `slow-${suffix}@example.test` },
      { id: fastId, name: "Fast", email: `fast-${suffix}@example.test` },
      { id: idleId, name: "Idle", email: `idle-${suffix}@example.test` },
    ]);
    try {
      const startedAt = new Date("2026-09-21T10:00:00Z");
      await db.insert(trips).values([
        {
          userId: slowId,
          distanceKm: 5,
          durationSec: 3600,
          co2SavedKg: 1,
          moneySavedEur: 1,
          fuelSavedL: 1,
          startedAt,
          endedAt: new Date(startedAt.getTime() + 3_600_000),
        },
        {
          userId: fastId,
          distanceKm: 20,
          durationSec: 3600,
          co2SavedKg: 2,
          moneySavedEur: 2,
          fuelSavedL: 2,
          startedAt,
          endedAt: new Date(startedAt.getTime() + 3_600_000),
        },
      ]);
      const app = new Hono<AuthEnv>();
      app.use("*", async (c, next) => {
        c.set("user", { id: fastId } as AuthEnv["Variables"]["user"]);
        await next();
      });
      app.route("/leaderboard", leaderboardRouter);
      const response = await app.request("/leaderboard?category=speed&limit=1");
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { entries: { userId: string }[] } };
      expect(body.data.entries.map((entry) => entry.userId)).toEqual([fastId]);
      const stats = await collectUserStats(fastId);
      expect(stats.tripCount).toBe(1);
      expect(stats.maxTripSpeedKmh).toBe(20);
    } finally {
      const { inArray } = await import("drizzle-orm");
      await db.delete(user).where(inArray(user.id, [slowId, fastId, idleId]));
    }
  });
});
