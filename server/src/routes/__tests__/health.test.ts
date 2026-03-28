import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

// Mock db to prevent real Postgres connection
const mockExecute = vi.fn().mockResolvedValue([{ rows: [{ size_mb: "42.3" }] }]);
const mockSelect = vi.fn();

vi.mock("../../db", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));
vi.mock("../../db/schema", () => ({ trips: {}, user: {} }));
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
    // selectChain: each .from().where().catch() call
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      catch: vi.fn().mockResolvedValue([{ value: 5 }]),
    };
    mockSelect.mockReturnValue(chain);

    const app = buildApp();
    const res = await app.request("/health/detailed");
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("uptime");
    expect(body.db).toMatchObject({ connected: expect.any(Boolean) });
    expect(body.users).toMatchObject({
      total: expect.any(Number),
      active7d: expect.any(Number),
    });
    expect(body.trips).toMatchObject({
      total: expect.any(Number),
      last7d: expect.any(Number),
    });
  });

  it("returns db.connected=false when db.execute throws", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"));

    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      catch: vi.fn().mockResolvedValue([null]),
    };
    mockSelect.mockReturnValue(chain);

    const app = buildApp();
    const res = await app.request("/health/detailed");
    const body = (await res.json()) as { db: { connected: boolean } };

    expect(res.status).toBe(200);
    expect(body.db.connected).toBe(false);
  });
});
