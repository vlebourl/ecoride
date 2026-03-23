import { Hono } from "hono";
import { eq, count, gte, sum, sql, desc } from "drizzle-orm";
import { db } from "../db";
import { user, trips } from "../db/schema";
import { adminMiddleware } from "../auth/admin";
import type { AuthEnv } from "../types/context";

const appVersion = (() => {
  try {
    return require("../../package.json").version;
  } catch {
    return "unknown";
  }
})();

const adminRouter = new Hono<AuthEnv>();

// All admin routes require admin privileges
adminRouter.use("*", adminMiddleware);

// GET /api/admin/health — Enhanced health check (admin-only)
adminRouter.get("/health", async (c) => {
  // User count
  const [userCountResult] = await db.select({ value: count() }).from(user);
  const userCount = userCountResult?.value ?? 0;

  // Trip count
  const [tripCountResult] = await db.select({ value: count() }).from(trips);
  const tripCount = tripCountResult?.value ?? 0;

  // Trips today
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const [tripsTodayResult] = await db
    .select({ value: count() })
    .from(trips)
    .where(gte(trips.startedAt, todayMidnight));
  const tripsToday = tripsTodayResult?.value ?? 0;

  // Trips this week (Monday 00:00)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const [tripsWeekResult] = await db
    .select({ value: count() })
    .from(trips)
    .where(gte(trips.startedAt, weekStart));
  const tripsThisWeek = tripsWeekResult?.value ?? 0;

  // DB connectivity check
  let dbConnected = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbConnected = true;
  } catch {
    // dbConnected stays false
  }

  return c.json({
    ok: true,
    data: {
      version: appVersion,
      uptime: process.uptime(),
      userCount,
      tripCount,
      tripsToday,
      tripsThisWeek,
      dbConnected,
    },
  });
});

// GET /api/admin/stats — Detailed admin stats
adminRouter.get("/stats", async (c) => {
  // Users with trip count and total CO2
  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      isAdmin: user.isAdmin,
      tripCount: count(trips.id),
      totalCo2: sum(trips.co2SavedKg).mapWith(Number),
    })
    .from(user)
    .leftJoin(trips, eq(user.id, trips.userId))
    .groupBy(user.id, user.name, user.email, user.createdAt, user.isAdmin)
    .orderBy(desc(user.createdAt));

  // Recent 20 trips with user name
  const recentTrips = await db
    .select({
      id: trips.id,
      userId: trips.userId,
      userName: user.name,
      distanceKm: trips.distanceKm,
      durationSec: trips.durationSec,
      co2SavedKg: trips.co2SavedKg,
      startedAt: trips.startedAt,
    })
    .from(trips)
    .innerJoin(user, eq(trips.userId, user.id))
    .orderBy(desc(trips.startedAt))
    .limit(20);

  // Daily trip counts for last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const dailyTrips = await db
    .select({
      date: sql<string>`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`.as("date"),
      count: count(),
    })
    .from(trips)
    .where(gte(trips.startedAt, sevenDaysAgo))
    .groupBy(sql`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`);

  // Fill in missing days with count 0
  const dailyTripCounts: { date: string; count: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0]!;
    const found = dailyTrips.find((r) => String(r.date) === dateStr);
    dailyTripCounts.push({ date: dateStr, count: found ? found.count : 0 });
  }

  return c.json({
    ok: true,
    data: {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        tripCount: u.tripCount,
        totalCo2: u.totalCo2 ?? 0,
        createdAt: u.createdAt.toISOString(),
        isAdmin: u.isAdmin,
      })),
      recentTrips: recentTrips.map((t) => ({
        id: t.id,
        userId: t.userId,
        userName: t.userName,
        distanceKm: t.distanceKm,
        durationSec: t.durationSec,
        co2SavedKg: t.co2SavedKg,
        startedAt: t.startedAt.toISOString(),
      })),
      dailyTripCounts,
    },
  });
});

export { adminRouter };
