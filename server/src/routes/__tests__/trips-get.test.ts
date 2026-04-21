import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  const mockSelect = vi.fn();
  return { mockSelect };
});

vi.mock("../../db", () => ({ db: { select: mocks.mockSelect } }));
vi.mock("../../db/schema", () => ({
  trips: { id: {}, userId: {}, idempotencyKey: {}, startedAt: {}, endedAt: {} },
}));
vi.mock("../../db/schema/auth", () => ({ user: { id: {}, consumptionL100: {}, fuelType: {} } }));
vi.mock("../../lib/badges", () => ({
  evaluateAndUnlockBadges: vi.fn(),
  reevaluateBadges: vi.fn(),
}));
vi.mock("../../lib/push", () => ({ sendPushToUser: vi.fn() }));
vi.mock("../../lib/leaderboard-notifications", () => ({ checkLeaderboardChanges: vi.fn() }));
vi.mock("../../lib/fuel-price", () => ({ getFuelPrice: vi.fn() }));
vi.mock("../../lib/calculations", () => ({ calculateSavings: vi.fn() }));
vi.mock("../../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withContext: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
  },
}));
vi.mock("../../lib/rate-limit", () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../../lib/audit", () => ({ logAudit: vi.fn() }));

import { tripsRouter } from "../trips.routes";

const TRIP_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const TRIP = {
  id: TRIP_ID,
  userId: "owner-1",
  distanceKm: 10,
  co2SavedKg: 1.5,
  moneySavedEur: 2,
  fuelSavedL: 0.7,
  startedAt: new Date().toISOString(),
  endedAt: new Date().toISOString(),
  gpsPoints: null,
};

function buildSelectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function buildApp(userId: string, isAdmin = false) {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, isAdmin } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/trips", tripsRouter);
  return app;
}

describe("GET /trips/:id", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the trip to its owner", async () => {
    mocks.mockSelect.mockReturnValue(buildSelectChain([TRIP]));
    const res = await buildApp("owner-1").request("/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.trip.id).toBe(TRIP_ID);
  });

  it("returns 403 when a non-admin requests another user's trip", async () => {
    mocks.mockSelect.mockReturnValue(buildSelectChain([TRIP]));
    const res = await buildApp("other-user").request("/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(res.status).toBe(403);
  });

  it("allows an admin to fetch another user's trip", async () => {
    mocks.mockSelect.mockReturnValue(buildSelectChain([TRIP]));
    const res = await buildApp("admin-user", true).request(
      "/trips/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.trip.id).toBe(TRIP_ID);
  });
});
