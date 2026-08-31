# ecoRide — Roadmap

> Dernière vérification contre le code : 2026-07-28 (v2.50.1).
> Les sections « Livré » ont été recochées en lisant le code, pas la mémoire.

---

## v1.0–v1.6 — Livrés

GPS tracking, badges, leaderboard (5 catégories + périodes), push notifications,
offline queue, privacy policy, RGPD, accessibilité, rate limiting, lazy loading,
pull-to-refresh, auto-bump CI/CD, Playwright smoke tests, palette Luminous Carbon.

Voir AUDIT-v1.2.md pour le détail des 31/35 findings corrigés.

---

## v2.0 — Tests & linting — livré

- [x] Vitest serveur + client, script `bun run test`, job CI
- [x] Tests `calculateSavings()`, `computeStreak()`, BADGE_THRESHOLDS, `createTripSchema`, `denseRank()`
- [x] ESLint flat (client + server + shared) + Prettier + husky/lint-staged
- [x] Jobs CI `lint` + `format:check`
- [x] commitlint (`.husky/commit-msg` + job CI `commitlint`)
- [x] CLAUDE.md projet

---

## v2.1 — Monitoring & admin — livré

- [x] Page admin `/admin` protégée (`adminMiddleware`), stats users/trips, infos système
- [x] Bouton de deploy manuel (`AdminSystemSection`)
- [x] `/api/health` enrichi (db, activeUsers7d, version) + `/api/health/detailed` admin-only
- [x] Sentry client + serveur, source maps uploadées via `sentryVitePlugin` (`sourcemap: "hidden"`)
- [x] Webhook Sentry → notifications (`sentry-webhook.routes.ts`)
- [x] Logger structuré JSON avec requestId + userId (`server/src/lib/logger.ts`)
- [x] Table `audit_logs` + consultation dans la page admin (`GET /admin/audit-logs`)
- [ ] Rotation / rétention des logs — aujourd'hui stdout capturé par Coolify, pas de politique explicite

---

## v2.2 — CI avancée — livré, sauf preview deploys

- [x] Coverage vitest client + server, commentaire PR, seuil bloquant
- [x] Bundle size check (budget +50 KB gzip, commentaire PR)
- [x] Lighthouse CI avec seuil a11y bloquant
- [x] Analyse dead code : Knip + dependency-cruiser (scripts `knip`, `depcruise`)
- [x] Renovate (`renovate.json`, auto-merge des patches)
- [ ] Preview deployments par PR (URL temporaire + auto-cleanup) — infra Coolify, gros chantier
- [ ] Seed script `bun run db:seed` (users fictifs + ~50 trips réalistes) pour démo et dev local

---

## v2.3 — Sécurité & DX

### Sécurité

- [x] Headers HSTS / X-Frame-Options / nosniff / Referrer-Policy
- [x] Content-Security-Policy strict (`server/src/lib/security-headers.ts`)
- [x] `bun audit` dans la CI (bloquant sur `critical`)
- [ ] Documenter la procédure de rotation des secrets (VAPID, auth secret, DB password)
- [ ] Pen test checklist automatisée (OWASP top 10)

### Précision des calculs — livré

- [x] Colonnes CO₂ / fuel en `numeric(10,3)`, `moneySavedEur` en `numeric(10,2)`
- [x] Migration des données existantes
- [x] Tests de précision sur les agrégations

### DX

- [ ] API docs auto-générées (OpenAPI depuis routes Hono + Zod)
- [ ] Dev containers (docker-compose, dev en 1 commande)
- [ ] Storybook pour les composants UI

---

## Dette connue

- ~~better-auth < 1.6.11 et drizzle-kit 0.30 traînent des CVE critiques~~ — corrigé :
  better-auth ^1.7.2, drizzle-kit ^0.31.10, drizzle-orm ^0.45.2. Le job `audit` de la CI
  n'a plus aucun `--ignore`, `bun audit --audit-level=critical` est vert.
- Migration `0004_account_issuer` : better-auth ≥ 1.6 exige une colonne `account.issuer`
  (`local:credential` / `https://accounts.google.com`). Le backfill est obligatoire — une
  valeur absente ou fausse verrouille le compte, vérifié sur une base réelle.
- Fenêtre de déploiement sur `account.issuer` : la migration tourne avant le démarrage du
  nouveau conteneur, donc si Coolify laisse l'ancien servir jusqu'au health check, une
  inscription pendant ces quelques secondes échoue en 500 (`issuer` NOT NULL sans défaut).
  Un `DEFAULT 'local:credential'` fermerait la fenêtre mais écrirait un issuer faux sur une
  ligne Google — un 500 visible et rejouable vaut mieux qu'une ligne silencieusement corrompue.
- Pas de vérification d'email : tous les comptes email/mot de passe ont `emailVerified = false`,
  donc better-auth ≥ 1.6 refuse de les lier à une connexion Google sur la même adresse
  (garde-fou GHSA-g38m-r43w-p2q7). Un flux de vérification d'email lèverait la limite.

---

## v3.0+ — Features (après consolidation)

> i18n fr/en : déjà livré (`client/src/i18n/`), retiré de la liste.

- Adresses favorites ([#273](https://github.com/vlebourl/ecoride/issues/273))
- Défis entre amis ("Je te défie de faire 50 km cette semaine")
- Fil d'activité (voir les derniers trajets de tous les utilisateurs)
- Partager son impact (Web Share API)
- Objectif mensuel configurable
- Thème clair (light mode)
- Haptic feedback + confettis badges
- Carte de tous les trajets superposés
- Comparaison mois par mois
- Intégration Strava
- Gamification avancée (niveaux, XP)
- Widget Android
