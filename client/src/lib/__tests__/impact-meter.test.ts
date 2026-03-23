import { describe, expect, it } from "vitest";
import { computeImpactLevel, IMPACT_REFERENCES } from "../impact-meter";

describe("computeImpactLevel", () => {
  it("returns first reference at 0 kg", () => {
    const level = computeImpactLevel(0);
    expect(level.currentRef.co2Kg).toBe(21);
    expect(level.progressRatio).toBe(0);
    expect(level.completedRefs).toHaveLength(0);
  });
  it("shows progress toward tree at 10 kg", () => {
    const level = computeImpactLevel(10);
    expect(level.currentRef.co2Kg).toBe(21);
    expect(level.progressRatio).toBeCloseTo(10 / 21);
  });
  it("transitions after completing tree (21 kg)", () => {
    const level = computeImpactLevel(21);
    expect(level.currentRef.co2Kg).toBe(45);
    expect(level.progressRatio).toBe(0);
    expect(level.completedRefs).toHaveLength(1);
  });
  it("shows progress within Paris-Lyon at 30 kg", () => {
    const level = computeImpactLevel(30);
    expect(level.currentRef.co2Kg).toBe(45);
    expect(level.progressRatio).toBeCloseTo(9 / 45);
  });
  it("transitions to gas tank at 66 kg", () => {
    const level = computeImpactLevel(66);
    expect(level.currentRef.co2Kg).toBe(115);
    expect(level.completedRefs).toHaveLength(2);
  });
  it("transitions to flight at 181 kg", () => {
    const level = computeImpactLevel(181);
    expect(level.currentRef.co2Kg).toBe(400);
    expect(level.completedRefs).toHaveLength(3);
  });
  it("maxes out beyond all references", () => {
    const level = computeImpactLevel(600);
    expect(level.nextRef).toBeNull();
    expect(level.progressRatio).toBe(1);
    expect(level.completedRefs).toHaveLength(4);
  });
  it("handles negative input", () => {
    expect(computeImpactLevel(-5).progressRatio).toBe(0);
  });
  it("includes nextRef correctly", () => {
    expect(computeImpactLevel(10).nextRef?.co2Kg).toBe(45);
  });
  it("references are ordered ascending", () => {
    for (let i = 1; i < IMPACT_REFERENCES.length; i++) {
      expect(IMPACT_REFERENCES[i]!.co2Kg).toBeGreaterThan(IMPACT_REFERENCES[i - 1]!.co2Kg);
    }
  });
});
