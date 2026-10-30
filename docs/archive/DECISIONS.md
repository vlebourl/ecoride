# EcoRide — Decisions architecturales

## 2026-03-21 — Scaffold initial

### Monorepo Bun workspaces

3 workspaces : `shared/`, `server/`, `client/`. Pas de `packages/` wrapper — chemins courts, rôle évident.

### IDs : UUID (gen_random_uuid)

Anti-énumération dans les réponses API. Natif PostgreSQL 13+, pas d'extension. Exception : les tables Better Auth utilisent des IDs `text` (format nanoid imposé par la lib).

### Better Auth : table `user` étendue

Better Auth impose 4 tables : `user`, `session`, `account`, `verification`. La table `user` du CDC est fusionnée avec celle de Better Auth — les champs métier (vehicle, preferences) sont des colonnes additionnelles sur la même table. Total : 7 tables Drizzle.

### Driver PostgreSQL : postgres.js

`postgres` (postgres.js) plutôt que `pg`. Recommandé par Drizzle, natif Bun, zéro bindings natifs, plus performant.

### fuel_type : text (pas enum PG)

Permet d'ajouter des types de carburant sans migration. Validation côté application via les types TypeScript partagés.

### reminder_days : text[] (array PG)

Plus simple qu'une table de jonction. Set fixe de 7 valeurs max.

### Tailwind v4 : CSS @theme

Pas de `tailwind.config.js`. Tout le theming est dans `client/src/app.css` via `@theme {}`. Plugin Vite `@tailwindcss/vite`.

### shared/ : exports .ts directs

Pas de build step pour `shared/`. Bun consomme le TS nativement côté serveur, Vite le transpile côté client. Les exports pointent directement vers les `.ts`.

### Numeric fields : real (float4)

Précision suffisante pour distances (km), consommations (L/100km), et montants (€). Pas besoin de `numeric`/`decimal` pour un tracker vélo.

### PWA : registerType autoUpdate

Stratégie la plus simple. Le service worker se met à jour automatiquement sans prompt utilisateur.
