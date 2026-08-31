import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { getAuthTables } from "better-auth/db";
import { getTableColumns, type Table } from "drizzle-orm";

vi.mock("../index", () => ({ db: {} }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../env", () => ({
  env: {
    NODE_ENV: "development",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    FRONTEND_URL: "http://localhost:5173",
  },
}));

import * as schema from "../schema";
import { auth } from "../../auth";

/**
 * Better Auth derives the columns it reads and writes from its own model
 * definitions, and its Drizzle adapter throws at runtime — not at build time —
 * when the Drizzle schema is missing one of them. Nothing else in the suite
 * exercises the adapter, so a Better Auth upgrade that adds a required field
 * (1.7 added `account.issuer`) can leave typecheck and every test green while
 * every sign-in and sign-up 500s in production.
 *
 * This test compares the two directly.
 */
describe("drizzle schema covers the Better Auth model", () => {
  const tables = getAuthTables(auth.options as never) as Record<
    string,
    { modelName: string; fields: Record<string, { fieldName?: string; required?: boolean }> }
  >;

  const toSnakeCase = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

  for (const [key, table] of Object.entries(tables)) {
    it(`declares every Better Auth field of "${table.modelName}"`, () => {
      const drizzleTable = ((schema as Record<string, unknown>)[key] ??
        (schema as Record<string, unknown>)[table.modelName]) as Table | undefined;
      expect(drizzleTable, `no Drizzle table exported for "${table.modelName}"`).toBeDefined();

      const columnNames = new Set(
        Object.values(getTableColumns(drizzleTable as Table)).map((column) => column.name),
      );
      const missing = Object.entries(table.fields)
        .map(([name, field]) => field.fieldName ?? name)
        .filter((name) => !columnNames.has(name) && !columnNames.has(toSnakeCase(name)));

      expect(missing, `missing columns on "${table.modelName}"`).toEqual([]);
    });
  }
});
