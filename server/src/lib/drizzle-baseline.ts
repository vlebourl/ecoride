import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import { logger } from "./logger";

export const LEGACY_BASELINE_TABLES = [
  "account",
  "achievements",
  "announcements",
  "audit_logs",
  "notification_logs",
  "push_subscriptions",
  "session",
  "trips",
  "user",
  "verification",
] as const;

export type LegacyBaselineAction = "skip-empty" | "skip-existing" | "bootstrap";

/**
 * Last migration that merely *describes* the schema a legacy production
 * database already has. Bootstrapping marks migrations as applied without
 * running them, so it must stop here: every migration after this tag makes a
 * real change and has to actually execute. Marking one applied by mistake
 * silently skips it forever — `0004_account_issuer` would leave
 * `account.issuer` missing and every sign-in would 500.
 *
 * Do not move this forward when adding a migration.
 */
export const LAST_LEGACY_BASELINE_TAG = "0003_lyrical_the_order";

interface JournalEntry {
  when: number;
  tag: string;
}

interface JournalFile {
  entries: JournalEntry[];
}

interface MigrationRecord {
  hash: string;
  createdAt: number;
}

export function resolveLegacyBaselineAction(existingTables: string[]): LegacyBaselineAction {
  const tableSet = new Set(existingTables);
  const present = LEGACY_BASELINE_TABLES.filter((table) => tableSet.has(table));

  if (present.length === 0) {
    return "skip-empty";
  }

  const missing = LEGACY_BASELINE_TABLES.filter((table) => !tableSet.has(table));
  if (missing.length > 0) {
    throw new Error(
      `Legacy production schema is only partially present; refusing baseline bootstrap because these tables are missing: ${missing.join(", ")}`,
    );
  }

  return "bootstrap";
}

export function readMigrationManifest(migrationsFolder: string): MigrationRecord[] {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Can't find Drizzle migration journal at ${journalPath}`);
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as JournalFile;
  const lastLegacyIndex = journal.entries.findIndex(
    (entry) => entry.tag === LAST_LEGACY_BASELINE_TAG,
  );
  if (lastLegacyIndex === -1) {
    throw new Error(
      `Migration journal has no entry tagged "${LAST_LEGACY_BASELINE_TAG}"; refusing to baseline.`,
    );
  }

  return journal.entries.slice(0, lastLegacyIndex + 1).map((entry) => {
    const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const sql = fs.readFileSync(sqlPath, "utf8");
    return {
      hash: crypto.createHash("sha256").update(sql).digest("hex"),
      createdAt: entry.when,
    };
  });
}

async function fetchPublicTables(sql: Sql): Promise<string[]> {
  const rows = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  return rows.map((row) => row.table_name);
}

async function fetchMigrationCount(sql: Sql): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count
    from drizzle.__drizzle_migrations
  `;
  return rows[0]?.count ?? 0;
}

export async function ensureLegacyDrizzleBaseline(
  databaseUrl: string,
  migrationsFolder: string,
): Promise<LegacyBaselineAction> {
  const sql = postgres(databaseUrl);

  try {
    const publicTables = await fetchPublicTables(sql);
    const action = resolveLegacyBaselineAction(publicTables);

    if (action === "skip-empty") {
      logger.info("drizzle_baseline_skipped_empty_database");
      return action;
    }

    await sql`create schema if not exists drizzle`;
    await sql`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `;

    const migrationCount = await fetchMigrationCount(sql);
    if (migrationCount > 0) {
      logger.info("drizzle_baseline_skipped_existing_metadata", { migrationCount });
      return "skip-existing";
    }

    const manifest = readMigrationManifest(migrationsFolder);
    await sql.begin(async (tx) => {
      for (const migration of manifest) {
        await tx.unsafe(
          "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
          [migration.hash, migration.createdAt],
        );
      }
    });

    logger.info("drizzle_baseline_bootstrapped", { insertedMigrations: manifest.length });
    return action;
  } finally {
    await sql.end();
  }
}
