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
    expect(startupScript).toContain('["bunx", "drizzle-kit", "migrate"]');
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
});
