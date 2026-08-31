-- The three indexes below were declared in the Drizzle schema by #216
-- ("chore: add missing DB indexes", 2026-04-09) but no migration ever created
-- them. The project had switched from `drizzle-kit push` to versioned
-- migrations two days earlier, so nothing applied the declaration: production
-- has carried only the primary keys on these tables ever since (confirmed
-- against the production database before writing this).
--
-- IF NOT EXISTS because a database seeded by the old `push` path may already
-- have them, and this migration must be correct either way.
CREATE INDEX IF NOT EXISTS "announcements_active_idx" ON "announcements" USING btree ("active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_logs_created_at_idx" ON "notification_logs" USING btree ("created_at");
