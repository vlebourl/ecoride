import { describe, expect, it } from "vitest";
import {
  buildAddTimezoneColumnSql,
  buildAlterNumericColumnSql,
  buildNonDestructiveMigrationSql,
  NUMERIC_COLUMN_MIGRATIONS,
} from "./non-destructive-migrations";

describe("non-destructive schema migrations", () => {
  it("uses ALTER COLUMN ... USING for every numeric conversion", () => {
    for (const spec of NUMERIC_COLUMN_MIGRATIONS) {
      const sql = buildAlterNumericColumnSql(spec);
      expect(sql).toContain(`ALTER TABLE "${spec.tableName}"`);
      expect(sql).toContain(
        `ALTER COLUMN "${spec.columnName}" TYPE numeric(${spec.precision}, ${spec.scale})`,
      );
      expect(sql).toContain(`USING ROUND("${spec.columnName}"::numeric, ${spec.scale})`);
    }
  });

  it("adds timezone non-destructively", () => {
    expect(buildAddTimezoneColumnSql()).toBe(
      'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text;',
    );
  });

  it("builds the full migration plan without destructive truncation", () => {
    const statements = buildNonDestructiveMigrationSql();

    expect(statements).toHaveLength(NUMERIC_COLUMN_MIGRATIONS.length + 1);
    expect(statements.join("\n")).not.toContain("TRUNCATE");
    expect(statements.at(-1)).toBe('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text;');
  });
});
