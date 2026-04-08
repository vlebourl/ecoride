import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("production database deployment safety", () => {
  it("does not auto-run drizzle push --force in the production image (regression: prod schema push wiped data)", () => {
    const dockerfile = readFileSync(join(import.meta.dirname, "../../../../Dockerfile"), "utf8");
    const startupScript = readFileSync(
      join(import.meta.dirname, "../../../scripts/start-production.ts"),
      "utf8",
    );
    const migrationJournal = readFileSync(
      join(import.meta.dirname, "../../../drizzle/meta/_journal.json"),
      "utf8",
    );

    expect(dockerfile).not.toContain("drizzle-kit push --force");
    expect(dockerfile).toContain("bun --cwd server scripts/start-production.ts");
    expect(startupScript).toContain("ensureCoolifyBackupBeforeMigration");
    expect(startupScript).toContain("ensureLegacyDrizzleBaseline");
    expect(startupScript).toContain('const repoRoot = path.resolve(import.meta.dirname, "../..")');
    expect(startupScript).toContain(
      '["bunx", "drizzle-kit", "migrate", "--config", "drizzle.config.ts"]',
    );
    expect(startupScript).toContain("cwd: repoRoot");
    expect(migrationJournal).toContain("0000_omniscient_doomsday");
  });

  it("keeps destructive drizzle push scoped to local development only", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dirname, "../../../../package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["db:push"]).toBeUndefined();
    expect(packageJson.scripts?.["db:push:local"]).toBe("drizzle-kit push");
    expect(packageJson.scripts?.["db:migrate"]).toBe("drizzle-kit migrate");
  });

  it("ships a committed migration for trip presets before production deploy", () => {
    const migrationJournal = readFileSync(
      join(import.meta.dirname, "../../../drizzle/meta/_journal.json"),
      "utf8",
    );
    const tripPresetMigration = readFileSync(
      join(import.meta.dirname, "../../../drizzle/0003_lyrical_the_order.sql"),
      "utf8",
    );

    expect(migrationJournal).toContain("0003_lyrical_the_order");
    expect(tripPresetMigration).toContain('CREATE TABLE "trip_presets"');
    expect(tripPresetMigration).toContain('CREATE INDEX "trip_presets_user_id_idx"');
    expect(tripPresetMigration).not.toContain('ADD COLUMN "super73_auto_mode_enabled"');
  });
});
