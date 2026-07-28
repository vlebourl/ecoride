import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({ db: { select: vi.fn() } }));
vi.mock("../../db/schema", () => ({
  trips: { userId: {}, startedAt: {}, distanceKm: {}, co2SavedKg: {} },
}));

import { db } from "../../db";
import { fetchDailyRows } from "../daily-rollup";

const mockDb = vi.mocked(db) as { select: ReturnType<typeof vi.fn> };

const ROWS = [
  { day: "2026-07-20", distanceKm: 12.5, co2Kg: 2.1, tripCount: 2 },
  { day: "2026-07-21", distanceKm: 8, co2Kg: 1.3, tripCount: 1 },
];

function chain(rows: unknown[]) {
  const groupBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ groupBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, groupBy };
}

describe("fetchDailyRows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sélectionne exactement les quatre colonnes de DailyRow", async () => {
    const c = chain(ROWS);
    mockDb.select.mockReturnValue({ from: c.from });

    await fetchDailyRows("user-1");

    const columns = mockDb.select.mock.calls[0]![0] as Record<string, unknown>;
    // Un renommage ou une colonne perdue casserait computeDerivedStats
    // silencieusement (`undefined` propagé en NaN dans les sommes).
    expect(Object.keys(columns).sort()).toEqual(["co2Kg", "day", "distanceKm", "tripCount"]);
  });

  it("filtre sur l'utilisateur et regroupe (sans groupBy, une seule ligne à vie)", async () => {
    const c = chain(ROWS);
    mockDb.select.mockReturnValue({ from: c.from });

    const rows = await fetchDailyRows("user-1");

    expect(c.where).toHaveBeenCalledTimes(1);
    expect(c.groupBy).toHaveBeenCalledTimes(1);
    expect(rows).toEqual(ROWS);
  });
});
