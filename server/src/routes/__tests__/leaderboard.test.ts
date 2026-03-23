import { describe, it, expect, vi } from "vitest";

// Mock db and schema to prevent real Postgres connection on module load
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../db/schema", () => ({ trips: {} }));
vi.mock("../../db/schema/auth", () => ({ user: {} }));
vi.mock("../../lib/validation", () => ({ validationHook: vi.fn() }));

import { denseRank } from "../leaderboard.routes";

describe("denseRank", () => {
  it("assigns rank 1 to all tied entries", () => {
    const entries = [
      { name: "Alice", score: 100 },
      { name: "Bob", score: 100 },
      { name: "Charlie", score: 100 },
    ];
    const ranked = denseRank(entries, (e) => e.score);
    expect(ranked.map((e) => e.rank)).toEqual([1, 1, 1]);
  });

  it("assigns correct ranks with no ties", () => {
    const entries = [
      { name: "Alice", score: 100 },
      { name: "Bob", score: 80 },
      { name: "Charlie", score: 60 },
    ];
    const ranked = denseRank(entries, (e) => e.score);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("uses position-based ranking after ties (standard competition ranking)", () => {
    // The implementation uses idx+1 after a value change,
    // producing standard competition ranking (1, 1, 3) not dense (1, 1, 2)
    const entries = [
      { name: "Alice", score: 100 },
      { name: "Bob", score: 100 },
      { name: "Charlie", score: 80 },
    ];
    const ranked = denseRank(entries, (e) => e.score);
    expect(ranked.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  it("handles single entry", () => {
    const entries = [{ name: "Alice", score: 50 }];
    const ranked = denseRank(entries, (e) => e.score);
    expect(ranked).toEqual([{ name: "Alice", score: 50, rank: 1 }]);
  });

  it("handles empty array", () => {
    const ranked = denseRank([], () => 0);
    expect(ranked).toEqual([]);
  });

  it("preserves original entry properties", () => {
    const entries = [
      { id: "1", name: "Alice", score: 100, extra: "data" },
    ];
    const ranked = denseRank(entries, (e) => e.score);
    expect(ranked[0]).toEqual({
      id: "1",
      name: "Alice",
      score: 100,
      extra: "data",
      rank: 1,
    });
  });

  it("handles multiple tie groups", () => {
    const entries = [
      { name: "A", score: 100 },
      { name: "B", score: 100 },
      { name: "C", score: 80 },
      { name: "D", score: 80 },
      { name: "E", score: 60 },
    ];
    const ranked = denseRank(entries, (e) => e.score);
    // A=1, B=1, C=3, D=3, E=5
    expect(ranked.map((e) => e.rank)).toEqual([1, 1, 3, 3, 5]);
  });

  it("handles zero values", () => {
    const entries = [
      { name: "A", score: 0 },
      { name: "B", score: 0 },
    ];
    const ranked = denseRank(entries, (e) => e.score);
    expect(ranked.map((e) => e.rank)).toEqual([1, 1]);
  });
});
