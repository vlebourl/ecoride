import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const fixtures = vi.hoisted(() => ({
  rows: [] as {
    userId: string;
    name: string;
    image: null;
    totalCo2SavedKg: number;
    totalDistanceKm: number;
    totalDurationSec: number;
    tripCount: number;
  }[],
}));
vi.mock("../../db", () => ({
  db: {
    select: () => {
      let ordered = false;
      return {
        from() {
          return this;
        },
        leftJoin() {
          return this;
        },
        where() {
          return this;
        },
        groupBy() {
          return this;
        },
        orderBy() {
          ordered = true;
          return this;
        },
        limit(n: number) {
          const rows = ordered
            ? [...fixtures.rows].sort(
                (a, b) =>
                  b.totalDistanceKm / b.totalDurationSec - a.totalDistanceKm / a.totalDurationSec,
              )
            : fixtures.rows;
          return Promise.resolve(rows.slice(0, n));
        },
      };
    },
  },
}));
vi.mock("../../lib/validation", () => ({ validationHook: vi.fn() }));

import { denseRank, leaderboardRouter } from "../leaderboard.routes";

it("selects the fastest rider before applying the SQL limit", async () => {
  fixtures.rows = [
    {
      userId: "slow",
      name: "Slow",
      image: null,
      totalCo2SavedKg: 0,
      totalDistanceKm: 1,
      totalDurationSec: 3600,
      tripCount: 1,
    },
    {
      userId: "mid",
      name: "Mid",
      image: null,
      totalCo2SavedKg: 0,
      totalDistanceKm: 2,
      totalDurationSec: 3600,
      tripCount: 1,
    },
    {
      userId: "fast",
      name: "Fast",
      image: null,
      totalCo2SavedKg: 0,
      totalDistanceKm: 10,
      totalDurationSec: 3600,
      tripCount: 1,
    },
  ];
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "fast" } as AuthEnv["Variables"]["user"]);
    await next();
  });
  app.route("/leaderboard", leaderboardRouter);
  const response = await app.request("/leaderboard?category=speed&limit=1");
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { entries: { userId: string }[] } };
  expect(body.data.entries.map((entry) => entry.userId)).toEqual(["fast"]);
});

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
    const entries = [{ id: "1", name: "Alice", score: 100, extra: "data" }];
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
