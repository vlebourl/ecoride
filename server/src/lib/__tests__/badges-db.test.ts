import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — use inline factories to avoid hoisting issues
// ---------------------------------------------------------------------------

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../db/schema", () => ({
  trips: {
    userId: {},
    distanceKm: {},
    durationSec: {},
    co2SavedKg: {},
    moneySavedEur: {},
    fuelSavedL: {},
    startedAt: {},
  },
  achievements: { userId: {}, badgeId: {} },
  user: { id: {}, timezone: {} },
}));
vi.mock("../streaks", () => ({ computeStreak: vi.fn() }));

import { db } from "../../db";
import { computeStreak } from "../streaks";
import { evaluateAndUnlockBadges, reevaluateBadges } from "../badges";

// Typed handles for the mocks
const mockDb = vi.mocked(db) as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const mockComputeStreak = vi.mocked(computeStreak);

// ---------------------------------------------------------------------------
// Per-test chain builder
// ---------------------------------------------------------------------------

/**
 * `where()` termine la requête pour les selects simples, mais la requête
 * journalière ajoute `.groupBy()`. On renvoie donc un thenable qui porte aussi
 * `groupBy`, ce qui couvre les deux formes avec un seul helper.
 */
function makeSelectChain(resolvedValue: unknown[]) {
  const terminal = Object.assign(Promise.resolve(resolvedValue), {
    groupBy: vi.fn().mockResolvedValue(resolvedValue),
  });
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(terminal),
  };
  return chain;
}

/**
 * collectUserStats() enchaîne trois selects : profil (timezone), agrégat
 * une-ligne, puis sommes par jour. Les tests n'ont besoin de piloter que
 * l'agrégat ; les deux autres reçoivent des valeurs neutres.
 */
function mockCollectStats(agg: Record<string, number> | null, daily: unknown[] = []) {
  mockDb.select
    .mockReturnValueOnce(makeSelectChain([{ timezone: "UTC" }]))
    .mockReturnValueOnce(makeSelectChain(agg === null ? [] : [agg]))
    .mockReturnValueOnce(makeSelectChain(daily));
}

function makeInsertChain() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  return { values, onConflictDoNothing };
}

function makeDeleteChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  return { where };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// evaluateAndUnlockBadges
// ---------------------------------------------------------------------------

describe("evaluateAndUnlockBadges", () => {
  it("returns [] when no thresholds are met", async () => {
    mockCollectStats({
      totalDistanceKm: 0,
      totalCo2SavedKg: 0,
      totalMoneySavedEur: 0,
      tripCount: 0,
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toEqual([]);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("unlocks first_trip badge on first trip", async () => {
    const insertChain = makeInsertChain();
    mockCollectStats({
      totalDistanceKm: 10,
      totalCo2SavedKg: 1,
      totalMoneySavedEur: 5,
      tripCount: 1,
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(insertChain);
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toContain("first_trip");
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.arrayContaining([{ userId: "user-1", badgeId: "first_trip" }]),
    );
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
  });

  it("does not re-unlock already earned badges", async () => {
    mockCollectStats({
      totalDistanceKm: 10,
      totalCo2SavedKg: 1,
      totalMoneySavedEur: 5,
      tripCount: 1,
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ badgeId: "first_trip" }]));
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).not.toContain("first_trip");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("unlocks multiple badges at once when thresholds are met", async () => {
    const insertChain = makeInsertChain();
    mockCollectStats({
      totalDistanceKm: 150,
      totalCo2SavedKg: 15,
      totalMoneySavedEur: 30,
      tripCount: 10,
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(insertChain);
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toContain("first_trip");
    expect(result).toContain("trips_10");
    expect(result).toContain("km_100");
    expect(result).toContain("co2_10kg");
  });

  it("unlocks money_100 badge at 100 EUR saved", async () => {
    const insertChain = makeInsertChain();
    mockCollectStats({
      totalDistanceKm: 50,
      totalCo2SavedKg: 5,
      totalMoneySavedEur: 100,
      tripCount: 10,
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(insertChain);
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toContain("money_100");
  });

  it("unlocks the daily record badges from the per-day rows", async () => {
    const insertChain = makeInsertChain();
    mockCollectStats(
      { totalDistanceKm: 60, totalCo2SavedKg: 6, totalMoneySavedEur: 20, tripCount: 3 },
      [{ day: "2026-07-20", distanceKm: 55, co2Kg: 5, tripCount: 2 }],
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(insertChain);
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toContain("day_30");
    expect(result).toContain("day_50");
  });

  it("handles empty aggregate result gracefully (fallback to 0)", async () => {
    mockCollectStats(null);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// reevaluateBadges
// ---------------------------------------------------------------------------

describe("reevaluateBadges", () => {
  it("returns [] when all unlocked badges are still earned", async () => {
    mockCollectStats({
      totalDistanceKm: 10,
      totalCo2SavedKg: 1,
      totalMoneySavedEur: 5,
      tripCount: 1,
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ badgeId: "first_trip" }]));
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await reevaluateBadges("user-1");
    expect(result).toEqual([]);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("revokes badges whose thresholds are no longer met", async () => {
    const deleteChain = makeDeleteChain();
    mockCollectStats({
      totalDistanceKm: 5,
      totalCo2SavedKg: 0.5,
      totalMoneySavedEur: 2,
      tripCount: 5,
    });
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ badgeId: "first_trip" }, { badgeId: "trips_10" }]),
    );
    mockDb.delete.mockReturnValue(deleteChain);
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await reevaluateBadges("user-1");
    expect(result).toContain("trips_10");
    expect(result).not.toContain("first_trip");
    expect(deleteChain.where).toHaveBeenCalled();
  });

  it("garde un badge streak quand la série en cours est cassée mais le record tient", async () => {
    // Régression : les prédicats streak lisent longestStreak, pas la série en
    // cours — sinon toute suppression de trajet révoquait le badge.
    mockCollectStats({
      totalDistanceKm: 200,
      totalCo2SavedKg: 20,
      totalMoneySavedEur: 60,
      tripCount: 40,
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ badgeId: "streak_7" }]));
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 12 });

    const result = await reevaluateBadges("user-1");
    expect(result).toEqual([]);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("revokes all badges when stats are zeroed", async () => {
    const deleteChain = makeDeleteChain();
    mockCollectStats({
      totalDistanceKm: 0,
      totalCo2SavedKg: 0,
      totalMoneySavedEur: 0,
      tripCount: 0,
    });
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ badgeId: "first_trip" }, { badgeId: "km_100" }, { badgeId: "trips_10" }]),
    );
    mockDb.delete.mockReturnValue(deleteChain);
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await reevaluateBadges("user-1");
    expect(result).toHaveLength(3);
    expect(deleteChain.where).toHaveBeenCalled();
  });

  it("returns [] when user has no badges", async () => {
    mockCollectStats({
      totalDistanceKm: 0,
      totalCo2SavedKg: 0,
      totalMoneySavedEur: 0,
      tripCount: 0,
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await reevaluateBadges("user-1");
    expect(result).toEqual([]);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});
