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
 * `groupBy`, ce qui couvre les deux formes avec un seul helper. `groupBy` est
 * ré-exposé sur le chaînage pour qu'un test puisse vérifier qu'il a bien été
 * appelé : sans regroupement, la requête journalière renverrait une seule ligne
 * agrégée sur tout l'historique et maxDayDistanceKm vaudrait le total à vie.
 */
function makeSelectChain(resolvedValue: unknown[]) {
  const groupBy = vi.fn().mockResolvedValue(resolvedValue);
  const terminal = Object.assign(Promise.resolve(resolvedValue), { groupBy });
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(terminal),
    groupBy,
  };
  return chain;
}

/**
 * Les 12 colonnes que sélectionne la requête d'agrégat. Les tests partent de ce
 * socle pour que chaque colonne soit réellement présente dans la fausse ligne :
 * une colonne absente retomberait sur `undefined ?? 0` et masquerait un renommage.
 */
const ZERO_AGG = {
  totalDistanceKm: 0,
  totalCo2SavedKg: 0,
  totalMoneySavedEur: 0,
  totalFuelSavedL: 0,
  tripCount: 0,
  maxTripDistanceKm: 0,
  maxTripDurationSec: 0,
  maxTripSpeedKmh: 0,
  earlyTripCount: 0,
  nightTripCount: 0,
  weekendTripCount: 0,
  distinctWeekdayCount: 0,
};

/**
 * collectUserStats() enchaîne trois selects : profil (timezone), agrégat
 * une-ligne, puis sommes par jour. Renvoie les trois faux chaînages pour que les
 * tests puissent assertion sur leur usage.
 */
function mockCollectStats(agg: Partial<typeof ZERO_AGG> | null, daily: unknown[] = []) {
  const profileChain = makeSelectChain([{ timezone: "UTC" }]);
  const aggChain = makeSelectChain(agg === null ? [] : [{ ...ZERO_AGG, ...agg }]);
  const dailyChain = makeSelectChain(daily);
  mockDb.select
    .mockReturnValueOnce(profileChain)
    .mockReturnValueOnce(aggChain)
    .mockReturnValueOnce(dailyChain);
  return { profileChain, aggChain, dailyChain };
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
    const { dailyChain } = mockCollectStats(
      { totalDistanceKm: 60, totalCo2SavedKg: 6, totalMoneySavedEur: 20, tripCount: 3 },
      [{ day: "2026-07-20", distanceKm: 55, co2Kg: 5, tripCount: 2 }],
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(insertChain);
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toContain("day_30");
    expect(result).toContain("day_50");
    // La requête journalière DOIT être regroupée. Sans groupBy, PostgreSQL
    // renverrait une ligne unique agrégée sur tout l'historique : day_30 et
    // day_50 se débloqueraient pour quiconque a cumulé 30 km à vie.
    expect(dailyChain.groupBy).toHaveBeenCalled();
    // computeDerivedStats attend exactement ces quatre colonnes.
    const dailyProjection = mockDb.select.mock.calls[2]?.[0] as Record<string, unknown>;
    expect(Object.keys(dailyProjection).sort()).toEqual(
      ["co2Kg", "day", "distanceKm", "tripCount"].sort(),
    );
  });

  it("lit chaque badge depuis sa propre colonne d'agrégat", async () => {
    // Douze colonnes, douze valeurs distinctes, douze badges pilotés chacun par
    // un seul champ. Une colonne renommée ou disparue de la requête retombe sur
    // `undefined ?? 0` — et fait tomber précisément son badge ici.
    const insertChain = makeInsertChain();
    mockCollectStats({
      totalDistanceKm: 5100, // km_5000
      totalCo2SavedKg: 260, // co2_250kg
      totalMoneySavedEur: 510, // money_500
      totalFuelSavedL: 51, // fuel_50l
      tripCount: 251, // trips_250
      maxTripDistanceKm: 52, // trip_50
      maxTripDurationSec: 7201, // trip_2h
      maxTripSpeedKmh: 26, // speed_25
      earlyTripCount: 11, // early_bird
      nightTripCount: 12, // night_owl
      weekendTripCount: 21, // weekend_20
      distinctWeekdayCount: 7, // all_week
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(insertChain);
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await evaluateAndUnlockBadges("user-1");

    // La fausse ligne est fabriquée par le test : elle prouve que chaque champ
    // est LU depuis la bonne clé, mais pas que la requête la PRODUIT. On vérifie
    // donc séparément la projection réellement passée à db.select() — c'est ce
    // qui tombe si une colonne est renommée ou supprimée de la requête.
    const aggProjection = mockDb.select.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(Object.keys(aggProjection).sort()).toEqual(Object.keys(ZERO_AGG).sort());

    for (const badgeId of [
      "km_5000",
      "co2_250kg",
      "money_500",
      "fuel_50l",
      "trips_250",
      "trip_50",
      "trip_2h",
      "speed_25",
      "early_bird",
      "night_owl",
      "weekend_20",
      "all_week",
    ]) {
      expect(result).toContain(badgeId);
    }
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
