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
  trips: { userId: {}, distanceKm: {}, co2SavedKg: {}, moneySavedEur: {} },
  achievements: { userId: {}, badgeId: {} },
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

function makeSelectChain(resolvedValue: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(resolvedValue),
  };
  return chain;
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
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 0, totalCo2SavedKg: 0, totalMoneySavedEur: 0, tripCount: 0 },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([]));
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toEqual([]);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("unlocks first_trip badge on first trip", async () => {
    const insertChain = makeInsertChain();
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 10, totalCo2SavedKg: 1, totalMoneySavedEur: 5, tripCount: 1 },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([]));
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
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 10, totalCo2SavedKg: 1, totalMoneySavedEur: 5, tripCount: 1 },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([{ badgeId: "first_trip" }]));
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).not.toContain("first_trip");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("unlocks multiple badges at once when thresholds are met", async () => {
    const insertChain = makeInsertChain();
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 150, totalCo2SavedKg: 15, totalMoneySavedEur: 30, tripCount: 10 },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([]));
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
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 50, totalCo2SavedKg: 5, totalMoneySavedEur: 100, tripCount: 10 },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(insertChain);
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await evaluateAndUnlockBadges("user-1");
    expect(result).toContain("money_100");
  });

  it("handles empty aggregate result gracefully (fallback to 0)", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([])).mockReturnValueOnce(makeSelectChain([]));
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
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 10, totalCo2SavedKg: 1, totalMoneySavedEur: 5, tripCount: 1 },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([{ badgeId: "first_trip" }]));
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await reevaluateBadges("user-1");
    expect(result).toEqual([]);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("revokes badges whose thresholds are no longer met", async () => {
    const deleteChain = makeDeleteChain();
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 5, totalCo2SavedKg: 0.5, totalMoneySavedEur: 2, tripCount: 5 },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([{ badgeId: "first_trip" }, { badgeId: "trips_10" }]));
    mockDb.delete.mockReturnValue(deleteChain);
    mockComputeStreak.mockResolvedValue({ current: 1, longest: 1 });

    const result = await reevaluateBadges("user-1");
    expect(result).toContain("trips_10");
    expect(result).not.toContain("first_trip");
    expect(deleteChain.where).toHaveBeenCalled();
  });

  it("revokes all badges when stats are zeroed", async () => {
    const deleteChain = makeDeleteChain();
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 0, totalCo2SavedKg: 0, totalMoneySavedEur: 0, tripCount: 0 },
        ]),
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { badgeId: "first_trip" },
          { badgeId: "km_100" },
          { badgeId: "trips_10" },
        ]),
      );
    mockDb.delete.mockReturnValue(deleteChain);
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await reevaluateBadges("user-1");
    expect(result).toHaveLength(3);
    expect(deleteChain.where).toHaveBeenCalled();
  });

  it("returns [] when user has no badges", async () => {
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
          { totalDistanceKm: 0, totalCo2SavedKg: 0, totalMoneySavedEur: 0, tripCount: 0 },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([]));
    mockComputeStreak.mockResolvedValue({ current: 0, longest: 0 });

    const result = await reevaluateBadges("user-1");
    expect(result).toEqual([]);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});
