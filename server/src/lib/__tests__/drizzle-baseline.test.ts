import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  LAST_LEGACY_BASELINE_TAG,
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

    expect(manifest.length).toBeGreaterThanOrEqual(1);
    expect(manifest[0]?.createdAt).toBeTypeOf("number");
    expect(manifest[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  // Regression: the manifest used to cover the whole journal. Bootstrapping
  // marks migrations applied WITHOUT running them, so any post-legacy
  // migration caught in it is skipped forever on a database that has the
  // legacy tables but no drizzle metadata (a restore of a pre-baseline dump).
  // For 0004 that means account.issuer is never created and every sign-in 500s.
  it("stops the baseline manifest at the last legacy migration", () => {
    const migrationsFolder = `${import.meta.dirname}/../../../drizzle`;
    const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
      entries: { tag: string }[];
    };

    const manifest = readMigrationManifest(migrationsFolder);
    const lastLegacyIndex = journal.entries.findIndex(
      (entry) => entry.tag === LAST_LEGACY_BASELINE_TAG,
    );

    expect(lastLegacyIndex).toBeGreaterThanOrEqual(0);
    expect(manifest).toHaveLength(lastLegacyIndex + 1);
    expect(manifest.length).toBeLessThan(journal.entries.length);
  });
});
