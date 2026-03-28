import { Hono } from "hono";
import { sql, count, gte, countDistinct } from "drizzle-orm";
import { db } from "../db";
import { user, trips } from "../db/schema";
import { adminMiddleware } from "../auth/admin";
import type { AuthEnv } from "../types/context";

const appVersion = (() => {
  try {
    return require("../../../package.json").version;
  } catch {
    return "unknown";
  }
})();

const healthRouter = new Hono<AuthEnv>();

// GET /api/health/detailed — Admin-only detailed health check
healthRouter.get("/detailed", adminMiddleware, async (c) => {
  let dbConnected = false;
  let dbSizeMb = 0;

  try {
    await db.execute(sql`SELECT 1`);
    dbConnected = true;
    const [sizeResult] = await db.execute(
      sql`SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) AS size_mb`,
    );
    dbSizeMb = Number((sizeResult as any)?.rows?.[0]?.size_mb ?? 0);
  } catch {
    // db unreachable
  }

  const [totalUsersResult] = await db
    .select({ value: count() })
    .from(user)
    .catch(() => [null]);
  const totalUsers = totalUsersResult?.value ?? 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [active7dResult] = await db
    .select({ value: countDistinct(trips.userId) })
    .from(trips)
    .where(gte(trips.startedAt, sevenDaysAgo))
    .catch(() => [null]);
  const activeUsers7d = active7dResult?.value ?? 0;

  const [totalTripsResult] = await db
    .select({ value: count() })
    .from(trips)
    .catch(() => [null]);
  const totalTrips = totalTripsResult?.value ?? 0;

  const [trips7dResult] = await db
    .select({ value: count() })
    .from(trips)
    .where(gte(trips.startedAt, sevenDaysAgo))
    .catch(() => [null]);
  const trips7d = trips7dResult?.value ?? 0;

  return c.json({
    ok: true,
    version: appVersion,
    uptime: process.uptime(),
    db: { connected: dbConnected, sizeMb: dbSizeMb },
    users: { total: totalUsers, active7d: activeUsers7d },
    trips: { total: totalTrips, last7d: trips7d },
  });
});

export { healthRouter };
