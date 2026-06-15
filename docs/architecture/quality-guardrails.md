# Architecture & quality guardrails

This document records the **stable, enforced** rules of the repository: the
module boundaries, where each check runs, and the policies behind them. It only
describes rules the repo and CI actually apply — it is not a wish list. When a
number is likely to move (coverage thresholds, complexity scores), this doc
points at the config that owns it instead of duplicating the value.

See also: [`CLAUDE.md`](../../CLAUDE.md) (project overview, dev rules),
[`DECISIONS.md`](../../DECISIONS.md) (one-off technical decisions),
[`docs/quality/complexity-baseline.md`](../quality/complexity-baseline.md)
(current hotspot scores).

## Package layout

Three Bun-workspace packages, consumed via the `@ecoride/shared` workspace
protocol (no npm publish):

```
shared/   framework-agnostic TypeScript types + API contracts
server/   Bun + Hono API + Drizzle ORM + PostgreSQL + Better Auth
client/   React 19 + Vite + Tailwind v4 PWA
```

Both `client` and `server` depend on `shared`. `shared` depends on neither.

## Module boundaries

Boundaries are enforced two ways: ESLint `no-restricted-imports` (runs in CI via
`lint`) and dependency-cruiser (`depcruise`, run locally). Both fail on
violation.

### Cross-package

- **`client` must not import `server`**, and **`server` must not import
  `client`** — the two halves only share types through `shared`.
- **`shared` must stay framework-agnostic** — it must not import from
  `client/src` or `server/src`. It carries types and API contracts only.

### Client internal layering

Lower layers must not reach up into the view:

- `client/src/hooks/**` must not import `pages/*` or `components/*`.
- `client/src/lib/**` must not import `pages/*`.

So data/logic (`lib`, `hooks`) is testable in isolation and never depends on
rendering.

### Server internal layering

Routes are the edge; nothing upstream may import them:

- `auth`, `cron`, `lib`, `types`, `validators` must not import `routes/**`.
- `db/**` is the floor: it must not import `routes`, `validators`, `lib`,
  `cron`, or `auth`.

dependency-cruiser additionally forbids **import cycles**, **unresolved
imports**, and **orphan files** (unreferenced modules outside a small
entrypoint whitelist) across all three packages.

## Where checks run

| Check                               | Command                        | CI (blocks PR) |   Pre-commit    | Local only |
| ----------------------------------- | ------------------------------ | :------------: | :-------------: | :--------: |
| Conventional commit message         | `commitlint`                   |       ✓        |                 |            |
| ESLint (boundaries, hooks, sonarjs) | `lint`                         |       ✓        | ✓ (lint-staged) |            |
| Prettier formatting                 | `format:check`                 |       ✓        | ✓ (lint-staged) |            |
| TypeScript typecheck                | `typecheck`                    |       ✓        |                 |            |
| Unit tests                          | `test` / `test:coverage`       |       ✓        |                 |            |
| Coverage thresholds                 | `test:coverage` (vitest v8)    |       ✓        |                 |            |
| Playwright smoke tests              | `playwright test`              |       ✓        |                 |            |
| Bundle size budget                  | CI `bundle-size` job           |       ✓        |                 |            |
| Lighthouse (accessibility)          | CI `lighthouse` job            |       ✓        |                 |            |
| Dependency boundaries / cycles      | `depcruise`                    |                |                 |     ✓      |
| Dead code & unused deps             | `knip:strict`                  |                |                 |     ✓      |
| Structural complexity               | `quality:complexity` (`fta .`) |                |                 |     ✓      |

`quality:local` (`format:check && lint && typecheck`) reproduces the fast CI
gates before pushing.

dependency-cruiser, knip and FTA are **deliberately local-only** today: they are
audit tools run before opening a PR, not blocking gates. The ESLint boundary
rules above are the CI-enforced subset of what dependency-cruiser audits.

## Complexity policy

`fta` produces a structural-complexity score per file; SonarJS contributes
`cognitive-complexity` (warns above 25) plus duplicate/identical-branch smells
via ESLint. Neither hard-fails CI — they are advisory signals.

The hotspot policy is **split, don't rewrite**: when a file climbs the FTA
ranking, extract cohesive sections (sub-components, query modules, hooks) in a
small PR that preserves or raises test coverage, rather than attempting a single
large rewrite. The pages and query layer were brought down this way (see the
cleanup epic, #317). Current scores live in
[`complexity-baseline.md`](../quality/complexity-baseline.md) and should be
refreshed when a hotspot is split.

## Coverage policy

Coverage measures **risk surfaces**, not whatever is easy to test. The `include`
globs are scoped to code that can carry a regression and excludes declarative or
view-only code:

- **server**: business logic, request validation, auth, and HTTP handlers.
  Declarative schema, bootstrap, cron wiring and type-only files are excluded.
- **client**: pure logic and stateful hooks (including the React Query data
  layer). View-only pages/components are excluded — they are exercised by
  Playwright e2e, and including them would force artificially low thresholds
  dominated by untested JSX branches.

Thresholds are set just under the measured floor so CI is green today and can be
**ratcheted up** as more risk surfaces gain tests. The authoritative `include`
globs and threshold numbers live in
[`client/vitest.config.ts`](../../client/vitest.config.ts) and
[`server/vitest.config.ts`](../../server/vitest.config.ts) — this doc
intentionally does not copy them, to avoid drift.
