import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, count, gte, sum, sql, desc, and } from "drizzle-orm";
import { db } from "../db";
import { user, trips, notificationLogs, announcements, auditLogs } from "../db/schema";
import { adminMiddleware } from "../auth/admin";
import { validationHook } from "../lib/validation";
import { rateLimit } from "../lib/rate-limit";
import { sendPushBroadcast } from "../lib/push";
import { logAudit } from "../lib/audit";
import { env } from "../env";
import { logger } from "../lib/logger";
import { forbidden, notFound } from "../lib/errors";
import type { AuthEnv } from "../types/context";

const appVersion = (() => {
  try {
    return require("../../../package.json").version;
  } catch {
    return "unknown";
  }
})();

const adminManagedUserSelection = {
  id: user.id,
  name: user.name,
  email: user.email,
  isAdmin: user.isAdmin,
  super73Enabled: user.super73Enabled,
};

const userIdSchema = z.object({
  userId: z.string().min(1),
});

async function getManagedUserById(userId: string) {
  const [targetUser] = await db
    .select(adminManagedUserSelection)
    .from(user)
    .where(eq(user.id, userId));
  if (!targetUser) {
    throw notFound(`User ${userId} not found`);
  }
  return targetUser;
}

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

  // DB connectivity check + size
  let dbConnected = false;
  let dbSizeMb = 0;
  try {
    await db.execute(sql`SELECT 1`);
    dbConnected = true;
    const [dbSizeResult] = await db.execute(
      sql`SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) AS size_mb`,
    );
    dbSizeMb = Number((dbSizeResult as any)?.rows?.[0]?.size_mb ?? 0);
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
      dbSizeMb,
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
      super73Enabled: user.super73Enabled,
      tripCount: count(trips.id),
      totalCo2: sum(trips.co2SavedKg).mapWith(Number),
    })
    .from(user)
    .leftJoin(trips, eq(user.id, trips.userId))
    .groupBy(user.id, user.name, user.email, user.createdAt, user.isAdmin, user.super73Enabled)
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
        super73Enabled: u.super73Enabled,
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

const grantAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

// POST /api/admin/users/grant — Grant admin role to an existing user
adminRouter.post(
  "/users/grant",
  rateLimit({ maxRequests: 10, windowMs: 60_000, prefix: "admin-grant-user" }),
  zValidator("json", grantAdminSchema, validationHook),
  async (c) => {
    const currentUser = c.get("user");
    const data = c.req.valid("json");

    const [targetUser] = await db
      .select(adminManagedUserSelection)
      .from(user)
      .where(eq(user.email, data.email));

    if (!targetUser) {
      throw notFound(`User with email ${data.email} not found`);
    }

    if (targetUser.isAdmin) {
      return c.json({
        ok: true,
        data: {
          granted: false,
          user: targetUser,
        },
      });
    }

    const [updatedUser] = await db
      .update(user)
      .set({
        isAdmin: true,
        updatedAt: new Date(),
      })
      .where(eq(user.id, targetUser.id))
      .returning(adminManagedUserSelection);

    logAudit(currentUser.id, "grant_admin", targetUser.id, { email: targetUser.email });

    return c.json({
      ok: true,
      data: {
        granted: true,
        user: updatedUser,
      },
    });
  },
);

// POST /api/admin/users/revoke — Revoke admin role from an existing user
adminRouter.post(
  "/users/revoke",
  rateLimit({ maxRequests: 10, windowMs: 60_000, prefix: "admin-revoke-user" }),
  zValidator("json", userIdSchema, validationHook),
  async (c) => {
    const currentUser = c.get("user");
    const data = c.req.valid("json");

    if (currentUser.id === data.userId) {
      throw forbidden("You cannot revoke your own admin access");
    }

    const targetUser = await getManagedUserById(data.userId);

    if (!targetUser.isAdmin) {
      return c.json({
        ok: true,
        data: {
          revoked: false,
          user: targetUser,
        },
      });
    }

    const [updatedUser] = await db
      .update(user)
      .set({
        isAdmin: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, targetUser.id))
      .returning(adminManagedUserSelection);

    logAudit(currentUser.id, "revoke_admin", targetUser.id, { email: targetUser.email });

    return c.json({
      ok: true,
      data: {
        revoked: true,
        user: updatedUser,
      },
    });
  },
);

// POST /api/admin/users/super73/grant — Grant Super73 access to an existing user
adminRouter.post(
  "/users/super73/grant",
  rateLimit({ maxRequests: 10, windowMs: 60_000, prefix: "admin-grant-super73" }),
  zValidator("json", userIdSchema, validationHook),
  async (c) => {
    const currentUser = c.get("user");
    const data = c.req.valid("json");

    const targetUser = await getManagedUserById(data.userId);

    if (targetUser.super73Enabled) {
      return c.json({
        ok: true,
        data: {
          granted: false,
          user: targetUser,
        },
      });
    }

    const [updatedUser] = await db
      .update(user)
      .set({
        super73Enabled: true,
        updatedAt: new Date(),
      })
      .where(eq(user.id, targetUser.id))
      .returning(adminManagedUserSelection);

    logAudit(currentUser.id, "grant_super73_access", targetUser.id, { email: targetUser.email });

    return c.json({
      ok: true,
      data: {
        granted: true,
        user: updatedUser,
      },
    });
  },
);

// POST /api/admin/notifications — Send push notification to users
const sendNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  url: z.string().min(1).optional(),
  userIds: z.array(z.string().min(1)).optional(),
});

adminRouter.post(
  "/notifications",
  rateLimit({ maxRequests: 5, windowMs: 60_000, prefix: "admin-broadcast" }),
  zValidator("json", sendNotificationSchema, validationHook),
  async (c) => {
    const data = c.req.valid("json");
    const currentUser = c.get("user");

    const payload = {
      title: data.title,
      body: data.body,
      url: data.url,
    };

    const targetUserIds = data.userIds && data.userIds.length > 0 ? data.userIds : undefined;

    const { sent, failed } = await sendPushBroadcast(payload, targetUserIds);

    const [log] = await db
      .insert(notificationLogs)
      .values({
        adminId: currentUser.id,
        title: data.title,
        body: data.body,
        url: data.url ?? null,
        targetUserIds: targetUserIds ?? null,
        sentCount: sent,
        failedCount: failed,
      })
      .returning({ id: notificationLogs.id });

    logAudit(currentUser.id, "admin_notification_sent", data.title, {
      sent,
      failed,
      broadcast: !targetUserIds,
    });

    return c.json({
      ok: true,
      data: { sent, failed, notificationId: log?.id },
    });
  },
);

// GET /api/admin/notifications — Notification history
adminRouter.get("/notifications", async (c) => {
  const logs = await db
    .select({
      id: notificationLogs.id,
      adminName: user.name,
      title: notificationLogs.title,
      body: notificationLogs.body,
      url: notificationLogs.url,
      targetUserIds: notificationLogs.targetUserIds,
      sentCount: notificationLogs.sentCount,
      failedCount: notificationLogs.failedCount,
      createdAt: notificationLogs.createdAt,
    })
    .from(notificationLogs)
    .innerJoin(user, eq(notificationLogs.adminId, user.id))
    .orderBy(desc(notificationLogs.createdAt))
    .limit(50);

  return c.json({
    ok: true,
    data: {
      notifications: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    },
  });
});

// --- Announcements ---

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  url: z.string().min(1).optional(),
});

// POST /api/admin/announcements — Create announcement
adminRouter.post(
  "/announcements",
  zValidator("json", createAnnouncementSchema, validationHook),
  async (c) => {
    const data = c.req.valid("json");
    const currentUser = c.get("user");

    // Deactivate all previous announcements
    await db.update(announcements).set({ active: false });

    const [ann] = await db
      .insert(announcements)
      .values({
        adminId: currentUser.id,
        title: data.title,
        body: data.body,
        url: data.url ?? null,
      })
      .returning();

    logAudit(currentUser.id, "announcement_created", data.title);

    return c.json(
      { ok: true, data: { announcement: { ...ann, createdAt: ann!.createdAt.toISOString() } } },
      201,
    );
  },
);

// GET /api/admin/announcements — List all announcements
adminRouter.get("/announcements", async (c) => {
  const list = await db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt))
    .limit(20);

  return c.json({
    ok: true,
    data: {
      announcements: list.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    },
  });
});

// DELETE /api/admin/announcements/:id — Delete announcement
adminRouter.delete("/announcements/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(announcements).where(eq(announcements.id, id));
  return c.json({ ok: true });
});

// GET /api/admin/audit-logs — Recent audit log entries with optional filtering
adminRouter.get("/audit-logs", async (c) => {
  const userId = c.req.query("userId");
  const action = c.req.query("action");

  const conditions = [];
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  if (action) conditions.push(eq(auditLogs.action, action));

  const query = db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      userName: user.name,
      action: auditLogs.action,
      target: auditLogs.target,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .innerJoin(user, eq(auditLogs.userId, user.id));

  const rows = await (conditions.length > 0
    ? query
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(100)
    : query.orderBy(desc(auditLogs.createdAt)).limit(100));

  return c.json({
    ok: true,
    data: {
      auditLogs: rows.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    },
  });
});

// POST /api/admin/deploy — Trigger Coolify deploy webhook
adminRouter.post(
  "/deploy",
  rateLimit({ maxRequests: 1, windowMs: 60_000, prefix: "admin-deploy" }),
  async (c) => {
    const currentUser = c.get("user");

    if (!env.COOLIFY_WEBHOOK_URL) {
      return c.json({ ok: false, error: "Deploy not configured" }, 503);
    }

    const fetchHeaders: Record<string, string> = {};
    if (env.COOLIFY_API_TOKEN) {
      fetchHeaders["Authorization"] = `Bearer ${env.COOLIFY_API_TOKEN}`;
    }

    let deployResponse: Response;
    try {
      deployResponse = await fetch(env.COOLIFY_WEBHOOK_URL, {
        method: "GET",
        headers: fetchHeaders,
      });
    } catch {
      return c.json({ ok: false, error: "Deploy failed" }, 502);
    }

    if (!deployResponse.ok) {
      const body = await deployResponse.text().catch(() => "");
      logger
        .withContext(c.get("requestId") as string | undefined)
        .error("deploy_webhook_failed", { status: deployResponse.status, body });
      return c.json({ ok: false, error: `Deploy failed: HTTP ${deployResponse.status}` }, 502);
    }

    logAudit(currentUser.id, "deploy_triggered", "coolify");

    return c.json({ ok: true });
  },
);

export { adminRouter };
