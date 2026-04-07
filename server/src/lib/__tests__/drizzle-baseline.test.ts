import { describe, expect, it } from "vitest";
import {
  LEGACY_BASELINE_TABLES,
  readMigrationManifest,
  resolveLegacyBaselineAction,
} from "../drizzle-baseline";

describe("drizzle baseline bootstrap", () => {
  it("skips bootstrap on an empty database", () => {
    expect(resolveLegacyBaselineAction([])).toBe("skip-empty");
  });

  it("bootstraps when the full legacy schema already exists", () => {
    expect(resolveLegacyBaselineAction([...LEGACY_BASELINE_TABLES])).toBe("bootstrap");
  });

  it("fails closed on a partially matching legacy schema", () => {
    expect(() => resolveLegacyBaselineAction(["user", "trips"])).toThrowError(/partially present/);
  });

  it("reads the committed Drizzle migration manifest", () => {
    const manifest = readMigrationManifest(`${import.meta.dirname}/../../../drizzle`);

    expect(manifest).toHaveLength(1);
    expect(manifest[0]?.createdAt).toBeTypeOf("number");
    expect(manifest[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
