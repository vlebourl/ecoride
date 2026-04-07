import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  getHealthSnapshot: vi.fn(),
}));

vi.mock("../../lib/health", () => ({
  getHealthSnapshot: mocks.getHealthSnapshot,
}));

vi.mock("../../auth/admin", () => ({
  adminMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

import { healthRouter } from "../health.routes";

function buildApp() {
  const app = new Hono();
  app.route("/health", healthRouter);
  return app;
}

describe("GET /health/detailed", () => {
  it("returns expected shape with db, users, trips keys", async () => {
    mocks.getHealthSnapshot.mockResolvedValueOnce({
      version: "2.15.8",
      uptime: 1234,
      db: { connected: true, sizeMb: 42.3 },
      users: { total: 5, active7d: 3 },
      trips: { total: 12, last7d: 4 },
    });

    const app = buildApp();
    const res = await app.request("/health/detailed");
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.version).toBe("2.15.8");
    expect(body.uptime).toBe(1234);
    expect(body.db).toEqual({ connected: true, sizeMb: 42.3 });
    expect(body.users).toEqual({ total: 5, active7d: 3 });
    expect(body.trips).toEqual({ total: 12, last7d: 4 });
  });

  it("returns degraded detailed payload when DB is unavailable", async () => {
    mocks.getHealthSnapshot.mockResolvedValueOnce({
      version: "2.15.8",
      uptime: 1234,
      db: { connected: false, sizeMb: 0 },
      users: { total: 0, active7d: 0 },
      trips: { total: 0, last7d: 0 },
    });

    const app = buildApp();
    const res = await app.request("/health/detailed");
    const body = (await res.json()) as { db: { connected: boolean } };

    expect(res.status).toBe(200);
    expect(body.db.connected).toBe(false);
  });
});
