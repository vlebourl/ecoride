import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createLocalAccountIssuer } from "better-auth/db";
import { google } from "better-auth/social-providers";

/**
 * Migration 0004 backfills `account.issuer` with two string literals copied
 * from Better Auth internals. The literals are load-bearing: sign-in matches
 * on them, and a row carrying the wrong value fails with "Invalid email or
 * password" (verified against a real PostgreSQL).
 *
 * `auth-schema.test.ts` only proves the column exists, so if a Better Auth
 * upgrade changed either string every test would stay green while every
 * pre-existing user was locked out. This pins the literals to their source.
 */
describe("migration 0004 issuer backfill values", () => {
  const migration = readFileSync(
    `${import.meta.dirname}/../../../drizzle/0004_account_issuer.sql`,
    "utf8",
  );

  it("backfills credential accounts with Better Auth's local issuer", () => {
    const issuer = createLocalAccountIssuer("credential");
    expect(issuer).toBe("local:credential");
    expect(migration).toContain(`SET "issuer" = '${issuer}' WHERE "provider_id" = 'credential'`);
  });

  it("backfills Google accounts with the provider's declared issuer", () => {
    const issuer = google({ clientId: "test-id", clientSecret: "test-secret" }).accountIssuer;
    expect(issuer).toBe("https://accounts.google.com");
    expect(migration).toContain(`SET "issuer" = '${issuer}' WHERE "provider_id" = 'google'`);
  });
});
