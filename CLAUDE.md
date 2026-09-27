# ecoRide — Project Instructions for Claude Code

## Project Overview

PWA mobile-first (React 19 + Bun + Hono) for tracking bike trips and calculating CO₂/money/fuel savings.
Deployed on self-hosted Coolify at ecoride.tiarkaerell.com via GitHub Actions auto-bump + deploy.

## Architecture

```
shared/     TypeScript types + API contracts (used by both client and server)
server/     Bun + Hono API + Drizzle ORM + PostgreSQL + Better Auth
client/     React 19 + Vite + TailwindCSS v4 + PWA + Playwright e2e
```

Module boundaries, the quality-check matrix (what runs in CI vs locally), and
the coverage/hotspot policies are documented in
[`docs/architecture/quality-guardrails.md`](docs/architecture/quality-guardrails.md).

## Key Technical Decisions

- **Auth**: Better Auth with Google OAuth + email/password. Sessions in DB, cookies with sameSite lax (required for OAuth callback).
- **DB**: PostgreSQL via Drizzle ORM with **versioned migrations** in `server/drizzle/`. Production runs `drizzle-kit migrate` on every boot (`server/scripts/start-production.ts`), after an attempted Coolify backup — see [Database Migrations](#database-migrations) for what happens when the backup is unconfigured. `drizzle-kit push` is local-dev only (`db:push:local`). Money/CO₂/fuel columns use `numeric` (migrated off `real`; see `server/src/db/schema/numeric.ts`).
- **PWA**: vite-plugin-pwa with autoUpdate. Custom version polling every 5 min via `/api/health`. Cache purge on version change. Skip auto-update during active GPS tracking.
- **GPS**: `navigator.geolocation.watchPosition` in a `useEffect` keyed on `[state.isTracking, state.isPaused]` (both deps are intentional — see Known Issues/Gotchas). All side effects (timer, GPS watch, wake lock, backup) inline in one effect to avoid React StrictMode cleanup issues.
- **Calculations**: ADEME factor 2.31 kg CO₂/L. Fuel price from data.economie.gouv.fr API (1.5s timeout, fallback to hardcoded prices). Calculated server-side at trip creation, stored immutably.
- **Leaderboard**: LEFT JOIN (shows users with 0 trips), dense ranking, 5 categories (co2/streak/trips/speed/money), period filtering.
- **Badges**: 46 badges (6 categories: volume, impact, régularité, records, habitudes, performance) evaluated after each trip creation. Revoked on trip deletion. ON CONFLICT DO NOTHING for idempotency.
- **Offline**: localStorage queue with idempotency keys. Auto-sync on `navigator.onLine` event.
- **Push**: VAPID keys in Coolify env. Fire-and-forget notifications for badges and leaderboard overtakes.

## CI/CD Pipeline

```
PR → CI (commitlint, lint/format, dependency audit, typecheck, vitest, bundle-size,
         coverage ≥70%, Playwright smoke, Lighthouse a11y — see .github/workflows/ci.yml)
Merge to main → Auto-bump (feat: → minor, fix: → patch) → Deploy to Coolify
```

- Auto-bump is in `.github/workflows/auto-bump.yml` — reads conventional commit, bumps package.json, pushes, then deploys
- Deploy and bump are in the SAME workflow (GITHUB_TOKEN can't trigger other workflows)
- `chore:` and `docs:` commits skip the version bump only. The `deploy` job still runs — it only depends on the `bump` job succeeding, not on a version actually being bumped
- `auto-bump.yml` triggers on push to `main` and does not itself wait on the `ci.yml` results — CI passing is enforced by branch protection on the PR, not by the deploy workflow
- Smoke tests in `client/e2e/` stub ALL `/api/**` calls and verify no React crash on every page

## Development Rules

### Branching — MANDATORY

- **NEVER commit directly to `main`** — not even a single line, not even a typo fix.
- Every task starts by pulling main first, then creating a dedicated branch:
  ```
  git checkout main
  git pull
  git checkout -b feat/...
  ```
- Push the branch and open a PR. CI must pass before merge.
- This applies to ALL agents and ALL sessions, no exceptions.
- **Why pull first**: auto-bump pushes a commit to main after every merge, so local main is almost always stale. Branching from stale main causes an immediate "out-of-date" PR.

### Bug Fixes

- Every bug fix MUST include a regression test (Playwright e2e or vitest unit)
- The test must fail before the fix and pass after

### Conventional Commits

- `feat:` for new features (triggers minor bump)
- `fix:` for bug fixes (triggers patch bump)
- `chore:` / `docs:` for non-functional changes (no version bump; the deploy step still runs — see CI/CD Pipeline)
- Multi-line commit messages are OK (the auto-bump uses env var, not direct interpolation)

### Agents

- When delegating to agents, always specify: read files first, run typecheck, run tests, include regression test for bug fixes
- Agents work in isolated worktrees — clean up with `git worktree prune` after
- Watch for React hooks order violations (useMemo/useCallback before early returns)
- Watch for imports that don't exist in the installed package version (e.g., useBlocker in react-router v7.13+)

## Database Migrations

Versioned Drizzle migrations in `server/drizzle/`, applied by `drizzle-kit migrate`
on every production boot (`server/scripts/start-production.ts`). **A committed
migration auto-applies on the next deploy.**

Before migrating, `ensureCoolifyBackupBeforeMigration` (`server/src/lib/coolify-backup.ts`)
triggers a Coolify backup and blocks on it — but only if `COOLIFY_WEBHOOK_URL` and
`COOLIFY_API_TOKEN` are both set. If either is missing, the backup check is **silently
skipped** (a `coolify_backup_check_skipped` warning log, then straight to migration) —
it is not a guaranteed pre-migration backup.

- `drizzle-kit push` is local-dev only (`db:push:local`). Never against production.
- Adding an index or column to `server/src/db/schema/` does **nothing** on its own.
  It needs a migration, or the declaration silently never reaches the database —
  that is how #216 left three indexes undeployed for five months.
- `meta/` is versioned (it was gitignored until #356). `drizzle-kit generate` diffs
  the schema against the newest snapshot there; without it, generate re-emits
  already-applied DDL. Run `bunx drizzle-kit generate --config drizzle.config.ts`
  and confirm it reports _"No schema changes"_ before assuming there is no drift.
- Migrations 0001+ were hand-written with hand-picked `when` values. If you write
  one by hand, add both the `.sql` file and its `_journal.json` entry —
  `server/src/db/__tests__/migration-chain.test.ts` fails if they disagree.
- `LAST_LEGACY_BASELINE_TAG` (`server/src/lib/drizzle-baseline.ts`) must stay at
  `0003`. Baselining marks migrations applied _without running them_, so moving it
  forward would silently skip a real change.

## Known Issues / Gotchas

- `useBlocker` does NOT exist in react-router v7.13+ — don't use it
- `useMemo` MUST be called before any conditional `return` in React components (Rules of Hooks)
- The `PullToRefresh` wrapper breaks `flex-1` height chain — use explicit heights for maps
- GPS `useEffect` dependency array is `[state.isTracking, state.isPaused]` — both are required. Adding a callback/function dependency will cause infinite cleanup/restart
- CI and the Dockerfile currently run plain `bun install`, not `--frozen-lockfile` (tracked for #369); update `bun.lock` whenever package manifests change regardless.
- The Docker runtime stage currently copies the full `node_modules` from the build stage rather than installing server-only production dependencies (also tracked for #369). `drizzle-kit` is a server dependency because migrations run at startup, so it must stay reachable however this evolves.
- VAPID keys must be configured in Coolify env vars — empty keys crash push subscription
- `user.super73DefaultAssist` / `super73DefaultLight` are retired preferences (#348/#349). The columns are kept on purpose — deleting them from the Drizzle schema would generate a destructive migration that auto-applies on deploy. Nothing reads or writes them; they still appear in the profile and GDPR export because those return a full row.

## Infrastructure

Server access, Coolify credentials, and container identifiers are **not documented in
this public repo**. They're kept in internal team memory — ask Lyra/Mnemosyne if an
agent session needs them.

## Current State

- Full GPS tracking with speed display, accuracy indicator, backup/recovery
- 46 badges (6 categories) with auto-unlock and revocation
- Leaderboard with 5 categories and 3 period filters
- Push notifications (badges, leaderboard overtakes, daily reminders)
- Offline trip queue with auto-sync
- Pull-to-refresh, auto-update, version display
- Account deletion, data export, privacy policy
- Rate limiting, security headers, input validation
- Vitest unit tests (server + client) and Playwright smoke/tracking/leaderboard/notifications e2e tests
- See `ROADMAP.md` for what's shipped vs. planned — this file doesn't duplicate that list because it goes stale otherwise

### Audit history

- `docs/archive/AUDIT-v1.2.md` — 2026-03-22 audit, frozen snapshot (31/35 items fixed
  at the time). Some items it lists as unfixed (e.g. the `real`→`numeric` migration)
  have since been resolved — don't treat it as current status, see `docs/archive/README.md`
  for a pointer to the newer audit.
