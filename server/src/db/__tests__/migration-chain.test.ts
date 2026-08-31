import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The migration folder is applied verbatim in production: start-production.ts runs
// `drizzle-kit migrate` on every boot, and drizzle's readMigrationFiles reads only
// meta/_journal.json plus the .sql files named by it. Nothing else validates this
// folder, and every migration from 0001 on was hand-written — so the two ways it
// has actually gone wrong are guarded here.
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../../drizzle");

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

const journal = JSON.parse(
  fs.readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
) as Journal;

const sqlFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

describe("drizzle migration chain", () => {
  it("journals every SQL file, and ships a SQL file for every journal entry", () => {
    // A .sql file with no journal entry is never applied — silently, which is how
    // the three indexes in 0005 went missing for five months. The reverse makes
    // production crash at boot: readMigrationFiles throws on a missing file.
    expect(journal.entries.map((e) => `${e.tag}.sql`).sort()).toEqual(sqlFiles);
  });

  it("keeps journal entries ordered and uniquely timestamped", () => {
    // drizzle records `when` in __drizzle_migrations and applies anything newer.
    // A duplicate or out-of-order value makes a migration skipped or replayed.
    const whens = journal.entries.map((e) => e.when);
    expect(whens).toEqual([...whens].sort((a, b) => a - b));
    expect(new Set(whens).size).toBe(whens.length);
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i));
  });

  it("versions a snapshot for the latest migration", () => {
    // `drizzle-kit generate` diffs the schema against the newest snapshot. With
    // meta/ untracked (it was gitignored until this commit) a fresh clone had no
    // base to diff against, so generate re-emitted already-applied DDL.
    const latest = journal.entries.at(-1)!;
    const snapshot = path.join(
      MIGRATIONS_DIR,
      "meta",
      `${String(latest.idx).padStart(4, "0")}_snapshot.json`,
    );
    expect(fs.existsSync(snapshot)).toBe(true);
  });
});
