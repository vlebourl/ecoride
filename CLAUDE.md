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

## Key Technical Decisions

- **Auth**: Better Auth with Google OAuth + email/password. Sessions in DB, cookies with sameSite lax (required for OAuth callback).
- **DB**: PostgreSQL via Drizzle ORM. Schema push (not migrations). Columns use `real` type (audit item: should migrate to `numeric`).
- **PWA**: vite-plugin-pwa with autoUpdate. Custom version polling every 5 min via `/api/health`. Cache purge on version change. Skip auto-update during active GPS tracking.
- **GPS**: `navigator.geolocation.watchPosition` in a `useEffect` keyed on `state.isTracking`. All side effects (timer, GPS watch, wake lock, backup) inline in one effect to avoid React StrictMode cleanup issues.
- **Calculations**: ADEME factor 2.31 kg CO₂/L. Fuel price from data.economie.gouv.fr API (1.5s timeout, fallback to hardcoded prices). Calculated server-side at trip creation, stored immutably.
- **Leaderboard**: LEFT JOIN (shows users with 0 trips), dense ranking, 5 categories (co2/streak/trips/speed/money), period filtering.
- **Badges**: 12 badges evaluated after each trip creation. Revoked on trip deletion. ON CONFLICT DO NOTHING for idempotency.
- **Offline**: localStorage queue with idempotency keys. Auto-sync on `navigator.onLine` event.
- **Push**: VAPID keys in Coolify env. Fire-and-forget notifications for badges and leaderboard overtakes.

## CI/CD Pipeline

```
PR → CI (typecheck + vitest + Playwright smoke tests)
Merge to main → Auto-bump (feat: → minor, fix: → patch) → Deploy to Coolify
```

- Auto-bump is in `.github/workflows/auto-bump.yml` — reads conventional commit, bumps package.json, pushes, then deploys
- Deploy and bump are in the SAME workflow (GITHUB_TOKEN can't trigger other workflows)
- `chore:` and `docs:` commits don't bump or deploy
- Smoke tests in `client/e2e/` stub ALL `/api/**` calls and verify no React crash on every page

## Development Rules

### Branching — MANDATORY

- **NEVER commit directly to `main`** — not even a single line, not even a typo fix.
- Every task (feature, fix, chore) starts by creating a dedicated branch: `git checkout -b feat/... main`
- Push the branch and open a PR. CI must pass before merge.
- This applies to ALL agents and ALL sessions, no exceptions.

### Bug Fixes

- Every bug fix MUST include a regression test (Playwright e2e or vitest unit)
- The test must fail before the fix and pass after

### Conventional Commits

- `feat:` for new features (triggers minor bump)
- `fix:` for bug fixes (triggers patch bump)
- `chore:` / `docs:` for non-functional changes (no bump, no deploy)
- Multi-line commit messages are OK (the auto-bump uses env var, not direct interpolation)

### Agents

- When delegating to agents, always specify: read files first, run typecheck, run tests, include regression test for bug fixes
- Agents work in isolated worktrees — clean up with `git worktree prune` after
- Watch for React hooks order violations (useMemo/useCallback before early returns)
- Watch for imports that don't exist in the installed package version (e.g., useBlocker in react-router v7.13+)

## Known Issues / Gotchas

- `useBlocker` does NOT exist in react-router v7.13+ — don't use it
- `useMemo` MUST be called before any conditional `return` in React components (Rules of Hooks)
- The `PullToRefresh` wrapper breaks `flex-1` height chain — use explicit heights for maps
- GPS `useEffect` must have ONLY `state.isTracking` as dependency — if you add callbacks, they'll cause infinite cleanup/restart
- Bun lockfile format differs between versions — CI uses `bun install` (not `--frozen-lockfile`)
- Dockerfile needs full node_modules (drizzle-kit is a devDep but needed at runtime for migrations)
- VAPID keys must be configured in Coolify env vars — empty keys crash push subscription

## Infrastructure

- **Server**: 192.168.1.48 (SSH as lyra@coolify)
- **Coolify**: Admin account admin@tiarkaerell.com
- **Coolify App UUID**: cr92jivsr4aypchftn3y2t74
- **Coolify API token**: ID 17 in personal_access_tokens table
- **GitHub runner**: Self-hosted `homelab-runner` at ~/ecoride-runner/ (systemd service)
- **DB container**: y12rxn4gjzsw1c3933wbe1wb (PostgreSQL, user: ecoride)

## Current State (v1.6+)

### What works

- Full GPS tracking with speed display, accuracy indicator, backup/recovery
- 12 badges with auto-unlock and revocation
- Leaderboard with 5 categories and 3 period filters
- Push notifications (badges, leaderboard overtakes, daily reminders)
- Offline trip queue with auto-sync
- Pull-to-refresh, auto-update, version display
- Account deletion, data export, privacy policy
- Rate limiting, security headers, input validation
- Playwright smoke tests (9 pages) + tracking test + leaderboard test + notifications test

### What's in progress (v2.0)

- Server-side unit tests (vitest)
- ESLint + Prettier + husky pre-commit
- See ROADMAP.md for full v2.0 plan

### Audit

- See AUDIT-v1.2.md for the comprehensive audit (31/35 items fixed)
