import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockInsertReturning = vi.fn();
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockEvaluateAndUnlockBadges = vi.fn();
  const mockReevaluateBadges = vi.fn();
  const mockSendPushToUser = vi.fn();
  const mockCheckLeaderboardChanges = vi.fn();
  const mockGetFuelPrice = vi.fn();
  const mockCalculateSavings = vi.fn();
  const mockLoggerError = vi.fn();
  const mockWithContext = vi.fn(() => ({ error: mockLoggerError, info: vi.fn(), warn: vi.fn() }));

  return {
    mockSelect,
    mockInsertReturning,
    mockInsertValues,
    mockInsert,
    mockEvaluateAndUnlockBadges,
    mockReevaluateBadges,
    mockSendPushToUser,
    mockCheckLeaderboardChanges,
    mockGetFuelPrice,
    mockCalculateSavings,
    mockLoggerError,
    mockWithContext,
  };
});

vi.mock("../../db", () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
  },
}));

vi.mock("../../db/schema", () => ({
  trips: {
    id: {},
    userId: {},
    idempotencyKey: {},
    startedAt: {},
    endedAt: {},
  },
}));

vi.mock("../../db/schema/auth", () => ({
  user: {
    id: {},
    consumptionL100: {},
    fuelType: {},
  },
}));

vi.mock("../../lib/badges", () => ({
  evaluateAndUnlockBadges: mocks.mockEvaluateAndUnlockBadges,
  reevaluateBadges: mocks.mockReevaluateBadges,
}));

vi.mock("../../lib/push", () => ({
  sendPushToUser: mocks.mockSendPushToUser,
}));

vi.mock("../../lib/leaderboard-notifications", () => ({
  checkLeaderboardChanges: mocks.mockCheckLeaderboardChanges,
}));

vi.mock("../../lib/fuel-price", () => ({
  getFuelPrice: mocks.mockGetFuelPrice,
}));

vi.mock("../../lib/calculations", () => ({
  calculateSavings: mocks.mockCalculateSavings,
}));

vi.mock("../../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withContext: mocks.mockWithContext,
  },
}));

vi.mock("../../lib/rate-limit", () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("../../lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { tripsRouter } from "../trips.routes";

function buildLimitChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function buildProfileChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/trips", tripsRouter);
  return app;
}

describe("POST /trips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockSelect
      .mockReturnValueOnce(buildLimitChain([]))
      .mockReturnValueOnce(buildProfileChain([{ consumptionL100: 6.5, fuelType: "sp95" }]));

    mocks.mockGetFuelPrice.mockResolvedValue({ priceEur: 1.82 });
    mocks.mockCalculateSavings.mockReturnValue({
      co2SavedKg: 1.617,
      moneySavedEur: 1.3,
      fuelSavedL: 0.7,
    });
    mocks.mockInsertReturning.mockResolvedValue([
      {
        id: "trip-1",
        userId: "user-1",
      },
    ]);
    mocks.mockEvaluateAndUnlockBadges.mockResolvedValue(["first_trip"]);
    mocks.mockSendPushToUser.mockRejectedValue(new Error("push offline"));
    mocks.mockCheckLeaderboardChanges.mockRejectedValue(new Error("leaderboard timeout"));
  });

  it("returns 201 and logs background failures instead of swallowing them silently", async () => {
    const app = buildApp();
    // Live trip (just ended): triggers both badge push and leaderboard check.
    const endedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - 600 * 1000).toISOString();
    const res = await app.request("/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distanceKm: 10,
        durationSec: 600,
        startedAt,
        endedAt,
        gpsPoints: null,
      }),
    });

    const body = (await res.json()) as { ok: boolean; data: { trip: { id: string } } };

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.trip.id).toBe("trip-1");

    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.mockWithContext).toHaveBeenCalledWith(undefined, "user-1");
    expect(mocks.mockLoggerError).toHaveBeenCalledWith(
      "badge_push_failed",
      expect.objectContaining({ badgeId: "first_trip", error: "push offline" }),
    );
    expect(mocks.mockLoggerError).toHaveBeenCalledWith(
      "leaderboard_check_failed",
      expect.objectContaining({ tripId: "trip-1", error: "leaderboard timeout" }),
    );
  });

  it("accepts legacy GPS points without timestamps and normalizes them", async () => {
    const app = buildApp();
    const res = await app.request("/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distanceKm: 10,
        durationSec: 600,
        startedAt: "2026-04-07T10:00:00.000Z",
        endedAt: "2026-04-07T10:10:00.000Z",
        gpsPoints: [
          { lat: "48.8566", lng: "2.3522" },
          { lat: 48.857, lng: 2.353, ts: "1712484600000" },
        ],
      }),
    });

    expect(res.status).toBe(201);
    expect(mocks.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        gpsPoints: [
          { lat: 48.8566, lng: 2.3522, ts: 0 },
          { lat: 48.857, lng: 2.353, ts: 1712484600000 },
        ],
      }),
    );
  });

  it("skips the leaderboard overtake check for backdated trips", async () => {
    const app = buildApp();
    // 2 days ago — historical entry, must not fire leaderboard notifications.
    const endedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const startedAt = new Date(new Date(endedAt).getTime() - 600 * 1000).toISOString();
    const res = await app.request("/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distanceKm: 10,
        durationSec: 600,
        startedAt,
        endedAt,
        gpsPoints: null,
      }),
    });

    expect(res.status).toBe(201);
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.mockCheckLeaderboardChanges).not.toHaveBeenCalled();
  });

  it("prices trips from the Annemasse market instead of the trip GPS start point", async () => {
    const app = buildApp();
    const res = await app.request("/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distanceKm: 12,
        durationSec: 900,
        startedAt: "2026-04-07T10:00:00.000Z",
        endedAt: "2026-04-07T10:15:00.000Z",
        gpsPoints: [
          { lat: 46.2044, lng: 6.1432, ts: 1712484000000 },
          { lat: 46.205, lng: 6.145, ts: 1712484300000 },
        ],
      }),
    });

    expect(res.status).toBe(201);
    expect(mocks.mockGetFuelPrice).toHaveBeenCalledWith("sp95");
  });

  // --- Rafale de notifications push ------------------------------------------
  // Le catalogue est passé de 13 à 46 badges : au premier trajet suivant le
  // déploiement, un utilisateur ancien franchit d'un coup une vingtaine de
  // seuils. Sans plafond, son téléphone vibre vingt fois et vingt requêtes
  // web-push partent pour un seul POST.

  async function postLiveTrip() {
    const endedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - 600 * 1000).toISOString();
    return buildApp().request("/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distanceKm: 10,
        durationSec: 600,
        startedAt,
        endedAt,
        gpsPoints: null,
      }),
    });
  }

  it("envoie une notification par badge tant qu'ils sont peu nombreux", async () => {
    mocks.mockSendPushToUser.mockResolvedValue(undefined);
    mocks.mockEvaluateAndUnlockBadges.mockResolvedValue(["first_trip", "trips_10", "km_100"]);

    expect((await postLiveTrip()).status).toBe(201);

    expect(mocks.mockSendPushToUser).toHaveBeenCalledTimes(3);
    expect(mocks.mockSendPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ body: "Badge débloqué : Premier trajet 🚴" }),
    );
  });

  it("agrège en une seule notification au-delà de 3 badges", async () => {
    mocks.mockSendPushToUser.mockResolvedValue(undefined);
    const many = [
      "first_trip",
      "trips_10",
      "trips_50",
      "trips_100",
      "km_100",
      "km_500",
      "km_1000",
      "co2_10kg",
      "co2_100kg",
      "fuel_25l",
      "fuel_50l",
      "money_100",
      "money_250",
    ];
    mocks.mockEvaluateAndUnlockBadges.mockResolvedValue(many);

    expect((await postLiveTrip()).status).toBe(201);

    // Une seule requête push, pas treize.
    expect(mocks.mockSendPushToUser).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendPushToUser).toHaveBeenCalledWith("user-1", {
      title: "ecoRide",
      body: "Badge débloqué : Premier trajet 🚴 +12 autres",
    });
  });

  it("reste par badge exactement au seuil (4 badges = agrégé, 3 = détaillé)", async () => {
    mocks.mockSendPushToUser.mockResolvedValue(undefined);
    mocks.mockEvaluateAndUnlockBadges.mockResolvedValue([
      "first_trip",
      "trips_10",
      "km_100",
      "co2_10kg",
    ]);

    expect((await postLiveTrip()).status).toBe(201);

    expect(mocks.mockSendPushToUser).toHaveBeenCalledTimes(1);
    expect(mocks.mockSendPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ body: "Badge débloqué : Premier trajet 🚴 +3 autres" }),
    );
  });
});
