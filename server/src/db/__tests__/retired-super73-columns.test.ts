import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { user } from "../schema/auth";

// super73DefaultAssist (#349) and super73DefaultLight (#348) are retired: nothing
// reads or writes them, and the API no longer accepts them. The columns stay on
// purpose, and two things depend on that staying true:
//
//   1. The stored values are riders' data. Dropping the columns is irreversible,
//      and this project runs `drizzle-kit migrate` on every production boot — so
//      deleting these schema lines auto-applies a destructive migration.
//   2. /api/user/export (GDPR) and /api/user/profile serialise a full Drizzle row:
//      authMiddleware sets `c.get("user")` from `db.select().from(user)`, not from
//      the Better Auth session object. The column declaration is therefore what
//      keeps these values in a rider's data export.
//
// Deleting the columns would break (2) silently — the export would just stop
// carrying them, with no test failing anywhere else.
describe("retired super73 columns", () => {
  const columns = getTableColumns(user);

  it.each([
    ["super73DefaultAssist", "super73_default_assist"],
    ["super73DefaultLight", "super73_default_light"],
  ])("still declares %s so a full row keeps carrying it", (property, columnName) => {
    expect(columns).toHaveProperty(property);
    expect(columns[property as keyof typeof columns]?.name).toBe(columnName);
  });

  it("keeps them nullable and free of defaults, as retired fields should be", () => {
    // A retired column must never become required or start inventing values:
    // that would make it look live again to the next reader.
    for (const property of ["super73DefaultAssist", "super73DefaultLight"] as const) {
      const column = columns[property];
      expect(column?.notNull).toBe(false);
      expect(column?.hasDefault).toBe(false);
    }
  });
});
