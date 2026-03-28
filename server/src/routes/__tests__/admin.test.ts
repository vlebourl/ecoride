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

vi.mock("../../db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ rows: [{ size_mb: "10.0" }] }]),
    select: () => ({
      from: () => ({
        // Support: await db.select().from(table)  [no .where()]
        then: (resolve: (...a: unknown[]) => unknown, reject?: (...a: unknown[]) => unknown) =>
          Promise.resolve([{ value: 0 }]).then(resolve, reject),
        catch: (reject: (...a: unknown[]) => unknown) =>
          Promise.resolve([{ value: 0 }]).catch(reject),
        // Support: await db.select().from(table).where(...)
        where: () => Promise.resolve([{ value: 0 }]),
      }),
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
