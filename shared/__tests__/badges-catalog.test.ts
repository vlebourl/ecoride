import { describe, it, expect } from "vitest";
import { BADGES, BADGE_CATEGORIES, type BadgeId } from "../types";

describe("BADGES catalog", () => {
  it("contient 46 badges", () => {
    expect(Object.keys(BADGES)).toHaveLength(46);
  });

  it("garde les 13 ids historiques intacts", () => {
    const legacy: BadgeId[] = [
      "first_trip",
      "trips_10",
      "trips_50",
      "trips_100",
      "km_100",
      "km_500",
      "km_1000",
      "co2_10kg",
      "co2_100kg",
      "co2_1t",
      "streak_7",
      "streak_30",
      "money_100",
    ];
    for (const id of legacy) {
      expect(BADGES[id]).toBeDefined();
    }
  });

  it("donne à chaque badge une catégorie connue", () => {
    for (const badge of Object.values(BADGES)) {
      expect(BADGE_CATEGORIES).toContain(badge.category);
    }
  });

  it("a un id cohérent avec sa clé", () => {
    for (const [key, badge] of Object.entries(BADGES)) {
      expect(badge.id).toBe(key);
    }
  });

  it("répartit les badges dans les 6 catégories aux bons effectifs", () => {
    const counts = BADGE_CATEGORIES.map(
      (c) => Object.values(BADGES).filter((b) => b.category === c).length,
    );
    expect(counts).toEqual([12, 13, 9, 5, 4, 3]);
  });
});
