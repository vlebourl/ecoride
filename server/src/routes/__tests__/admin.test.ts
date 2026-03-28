import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// vi.hoisted ensures mockEnv is initialized before vi.mock factories run
const mockEnv = vi.hoisted(
  () =>
    ({ COOLIFY_WEBHOOK_URL: "https://coolify.example.com/webhook/test" }) as {
      COOLIFY_WEBHOOK_URL: string | undefined;
    },
);

vi.mock("../../env", () => ({ env: mockEnv }));

// Audit log rows returned by the DB mock — tests can replace .value
const mockAuditRows = vi.hoisted(() => ({
  value: [
    {
      id: "log-1",
      userId: "user-abc",
      userName: "Alice",
      action: "delete_trip",
      target: "trip-1",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "log-2",
      userId: "user-xyz",
      userName: "Bob",
      action: "delete_account",
      target: "user-xyz",
      metadata: null,
      createdAt: new Date("2026-01-02T00:00:00Z"),
    },
  ] as unknown[],
}));

vi.mock("../../db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ rows: [{ size_mb: "10.0" }] }]),
    select: () => ({
      from: () => {
        // Terminal promise for simple aggregation queries (db.select().from(table))
        const simple = Promise.resolve([{ value: 0 }]);

        // Chain returned after .innerJoin() — supports .where().orderBy().limit() and
        // .orderBy().limit() (the two paths used by the audit-logs endpoint).
        const auditChain = {
          where: () => ({
            orderBy: () => ({ limit: () => Promise.resolve(mockAuditRows.value) }),
          }),
          orderBy: () => ({ limit: () => Promise.resolve(mockAuditRows.value) }),
        };

        return {
          // Direct await: db.select().from(table) — for aggregation queries
          then: simple.then.bind(simple),
          catch: simple.catch.bind(simple),
          // .where(cond) — for aggregation queries with date filter
          where: () => Promise.resolve([{ value: 0 }]),
          // .innerJoin(...) — for audit-logs query
          innerJoin: () => auditChain,
          // .leftJoin / .groupBy / .orderBy for admin-stats query
          leftJoin: () => ({
            groupBy: () => ({ orderBy: () => Promise.resolve([]) }),
          }),
          innerJoin2: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }),
          groupBy: () => ({ orderBy: () => Promise.resolve([]) }),
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
        };
      },
    }),
  },
}));

vi.mock("../../db/schema", () => ({
  user: {},
  trips: {},
  notificationLogs: {},
  announcements: {},
  auditLogs: {},
}));

vi.mock("../../auth/admin", () => ({
  adminMiddleware: vi.fn(
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("user", { id: "admin-user-id", name: "Admin" });
      await next();
    },
  ),
}));

const mockLoggerError = vi.fn();
vi.mock("../../lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    withContext: vi.fn(() => ({
      error: mockLoggerError,
      info: vi.fn(),
      warn: vi.fn(),
    })),
  },
}));

vi.mock("../../lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../../lib/push", () => ({
  sendPushBroadcast: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}));
vi.mock("../../lib/rate-limit", () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

import { adminRouter } from "../admin.routes";

function buildApp() {
  const app = new Hono();
  app.route("/admin", adminRouter);
  return app;
}

// ---- Deploy route regression tests (ECO-13 bug #1) ----

describe("POST /admin/deploy", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockEnv.COOLIFY_WEBHOOK_URL = "https://coolify.example.com/webhook/test";
    mockLoggerError.mockClear();
  });

  it("returns 502 when webhook returns a non-2xx status (regression: was silently ok:true)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      }),
    );

    const res = await buildApp().request("/admin/deploy", { method: "POST" });
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
  });

  it("logs structured error via logger.withContext when webhook returns non-2xx (regression: was bare console.error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
      }),
    );

    await buildApp().request("/admin/deploy", { method: "POST" });

    expect(mockLoggerError).toHaveBeenCalledOnce();
    expect(mockLoggerError).toHaveBeenCalledWith("deploy_webhook_failed", {
      status: 503,
      body: "Service Unavailable",
    });
  });

  it("returns ok:true when webhook returns 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const res = await buildApp().request("/admin/deploy", { method: "POST" });
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("returns 503 when COOLIFY_WEBHOOK_URL is not configured", async () => {
    mockEnv.COOLIFY_WEBHOOK_URL = undefined;

    const res = await buildApp().request("/admin/deploy", { method: "POST" });
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Deploy not configured");
  });

  it("returns 502 when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const res = await buildApp().request("/admin/deploy", { method: "POST" });
    const body = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
  });
});

// ---- Admin health version regression test (ECO-13 bug #2) ----

describe("GET /admin/health", () => {
  it("returns root package.json version, not server/package.json 0.0.1 (regression)", async () => {
    const res = await buildApp().request("/admin/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { version: string } };

    expect(body.ok).toBe(true);
    // server/package.json has version "0.0.1"; root package.json has the real version.
    // After the fix (require("../../../package.json")), this must not be "0.0.1".
    expect(body.data.version).not.toBe("0.0.1");
    expect(body.data.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// ---- Audit log filtering tests (ECO-15) ----

type AuditLogsBody = {
  ok: boolean;
  data: {
    auditLogs: Array<{
      id: string;
      userId: string;
      userName: string;
      action: string;
      target: string | null;
      metadata: unknown;
      createdAt: string;
    }>;
  };
};

describe("GET /admin/audit-logs", () => {
  it("returns all entries when no filters are provided", async () => {
    mockAuditRows.value = [
      {
        id: "log-1",
        userId: "user-abc",
        userName: "Alice",
        action: "delete_trip",
        target: "trip-1",
        metadata: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "log-2",
        userId: "user-xyz",
        userName: "Bob",
        action: "delete_account",
        target: "user-xyz",
        metadata: null,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ];

    const res = await buildApp().request("/admin/audit-logs");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuditLogsBody;
    expect(body.ok).toBe(true);
    expect(body.data.auditLogs).toHaveLength(2);
    expect(body.data.auditLogs[0]!.id).toBe("log-1");
    expect(body.data.auditLogs[1]!.id).toBe("log-2");
    // Dates should be ISO strings
    expect(body.data.auditLogs[0]!.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("passes ?action=delete_trip query param and returns matching entries", async () => {
    mockAuditRows.value = [
      {
        id: "log-1",
        userId: "user-abc",
        userName: "Alice",
        action: "delete_trip",
        target: "trip-1",
        metadata: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];

    const res = await buildApp().request("/admin/audit-logs?action=delete_trip");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuditLogsBody;
    expect(body.ok).toBe(true);
    expect(body.data.auditLogs).toHaveLength(1);
    expect(body.data.auditLogs[0]!.action).toBe("delete_trip");
  });

  it("passes ?userId=user-abc query param and returns matching entries", async () => {
    mockAuditRows.value = [
      {
        id: "log-1",
        userId: "user-abc",
        userName: "Alice",
        action: "delete_trip",
        target: "trip-1",
        metadata: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];

    const res = await buildApp().request("/admin/audit-logs?userId=user-abc");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuditLogsBody;
    expect(body.ok).toBe(true);
    expect(body.data.auditLogs).toHaveLength(1);
    expect(body.data.auditLogs[0]!.userId).toBe("user-abc");
  });
});
