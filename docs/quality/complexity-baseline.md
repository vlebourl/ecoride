# Complexity baseline

## Purpose

This repo now tracks maintainability pressure with two complementary tools:

- **ESLint + SonarJS** for inline developer feedback on production code smells.
- **FTA** for whole-repo structural scoring and hotspot ranking.

## Commands

- `bun run lint`
- `bun run quality:complexity`

## SonarJS rules enabled

Applied to `client/src/**/*.{ts,tsx}`, `server/src/**/*.{ts,tsx}`, and `shared/*.ts` (excluding test files):

- `sonarjs/cognitive-complexity` — warn above 25
- `sonarjs/no-duplicated-branches`
- `sonarjs/no-identical-conditions`
- `sonarjs/no-identical-expressions`
- `sonarjs/no-useless-catch`

## Initial SonarJS warnings

Current `bun run lint` complexity warnings:

- `client/src/components/Super73ModeButton.tsx` — complexity 27
- `client/src/components/trip/GpsStatusBadge.tsx` — complexity 39
- `client/src/pages/AdminPage.tsx` — complexity 38
- `client/src/pages/ProfilePage.tsx` — complexity 32
- `client/src/pages/TripPage.tsx` — complexity 28

## Initial FTA production hotspots

Top FTA scores from `bun run quality:complexity` on merged main:

1. `client/src/pages/ProfilePage.tsx` — 74.71
2. `client/src/pages/TripPage.tsx` — 74.28
3. `client/src/pages/AdminPage.tsx` — 71.27
4. `client/src/hooks/useSuper73.ts` — 71.20
5. `client/src/pages/StatsPage.tsx` — 70.77
6. `client/src/hooks/queries.ts` — 69.19
7. `server/src/routes/admin.routes.ts` — 67.45
8. `client/src/hooks/useGpsTracking.ts` — 67.23
9. `client/src/pages/DashboardPage.tsx` — 66.57
10. `client/src/pages/VehiclePage.tsx` — 64.26

## Notes

- FTA also scores tests and e2e specs; use the production-code hotspot list above to prioritize refactors.
- The existing `react-refresh/only-export-components` warnings are tracked separately and are not part of this complexity baseline.
