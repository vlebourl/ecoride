-- Better Auth >= 1.6 requires account.issuer. Added nullable first so the
-- backfill can run, then made NOT NULL: a NULL issuer locks the user out
-- (sign-in matches on `account.issuer === "local:credential"`).
ALTER TABLE "account"
ADD COLUMN "issuer" text;--> statement-breakpoint

-- Values come from Better Auth itself: createLocalAccountIssuer("credential")
-- for email/password, and the Google provider's declared accountIssuer.
UPDATE "account" SET "issuer" = 'local:credential' WHERE "provider_id" = 'credential';--> statement-breakpoint
UPDATE "account" SET "issuer" = 'https://accounts.google.com' WHERE "provider_id" = 'google';--> statement-breakpoint

-- Any other provider_id would be unexpected here (ecoRide only wires Google
-- and email/password); fall back to the local namespace rather than leaving
-- a NULL that would break the next statement.
UPDATE "account" SET "issuer" = 'local:' || "provider_id" WHERE "issuer" IS NULL;--> statement-breakpoint

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
