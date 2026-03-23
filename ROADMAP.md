# ecoRide — Roadmap

---

## v1.0–v1.6 — Livrés

GPS tracking, badges, leaderboard (5 catégories + périodes), push notifications,
offline queue, privacy policy, RGPD, accessibilité, rate limiting, lazy loading,
pull-to-refresh, auto-bump CI/CD, Playwright smoke tests, palette Luminous Carbon.

Voir AUDIT-v1.2.md pour le détail des 31/35 findings corrigés.

---

## v2.0 — Tests & linting (en cours)

### Tests serveur — PR #72

- [x] Config vitest pour server/ + script `bun run test` + job CI
- [x] Tests `calculateSavings()` (8 tests)
- [x] Tests `computeStreak()` / `computeStreakFromDates()` (12 tests)
- [x] Tests BADGE_THRESHOLDS (27 tests — exact threshold + juste en dessous pour chaque badge)
- [x] Tests createTripSchema (18 tests — validation Zod complète)
- [x] Tests `denseRank()` (8 tests)
- [ ] Objectif : coverage > 80% sur server/src/lib/ (à mesurer)

### ESLint + Prettier — PR #71

- [x] Config ESLint flat (client + server + shared)
- [x] Config Prettier
- [x] Husky + lint-staged pre-commit hook
- [x] Fix erreurs de linting existantes (0 errors, 15 warnings)
- [x] Job CI `lint` + `format:check`

### Commit lint — en cours

- [ ] commitlint config (conventional commits)
- [ ] Hook commit-msg qui valide le format du message
- [ ] Empêche les "wip", "fix stuff" et les messages qui cassent l'auto-bump

### CLAUDE.md projet

- [x] Créé — instructions complètes pour les agents (architecture, gotchas, rules)

---

## v2.1 — Monitoring & admin

### Page admin (/admin)

- [ ] Route protégée (admin only — vérifier un flag `isAdmin` sur le user)
- [ ] Dashboard : nb users, nb trips total, trips/jour (7 derniers jours), erreurs récentes
- [ ] Infos système : version déployée, uptime serveur, taille DB
- [ ] Liste des users avec stats (admin peut voir tous les users)
- [ ] Bouton pour trigger un deploy manuellement

### Health check enrichi

- [ ] `/api/health` retourne aussi : DB connected (ping), nb users actifs (7j), disk usage si dispo
- [ ] Endpoint `/api/health/detailed` (admin only) avec métriques complètes

### Sentry (ou alternative)

- [ ] Intégrer Sentry côté client (ErrorBoundary + unhandledrejection)
- [ ] Source maps uploadées dans la CI (pour stack traces lisibles)
- [ ] Alertes email/push sur erreurs critiques
- [ ] Optionnel côté serveur (Hono error handler → Sentry)

### Logs structurés

- [ ] Remplacer console.log/warn/error par un logger structuré (JSON)
- [ ] Chaque log inclut : timestamp, level, requestId, userId (si auth), message, data
- [ ] Rotation/retention des logs (ou export vers un service externe)

### Audit log

- [ ] Table `audit_logs` : userId, action, target, metadata, createdAt
- [ ] Actions tracées : suppression compte, suppression trajet, changement profil véhicule
- [ ] Visible dans la page admin

---

## v2.2 — CI avancée

### Coverage report dans les PRs

- [ ] vitest coverage (c8 ou istanbul) pour client + server
- [ ] GitHub Action qui poste un commentaire avec le % et les diff de coverage
- [ ] Seuil minimum : fail la CI si coverage < 70%

### Bundle size check

- [ ] Mesurer la taille du bundle JS/CSS après build
- [ ] Comparer avec main et alerter si +50 KB
- [ ] GitHub Action comment ou status check

### Lighthouse CI

- [ ] Lancer Lighthouse sur le build preview (performance, PWA, a11y, SEO)
- [ ] Poster le score dans la PR
- [ ] Seuils : performance > 80, PWA > 90, a11y > 85

### Preview deployments

- [ ] Chaque PR déployée sur une URL temporaire (ex: pr-42.ecoride.tiarkaerell.com)
- [ ] Coolify ou Vercel-like preview
- [ ] Auto-cleanup quand la PR est fermée

### Seed script

- [ ] `bun run db:seed` qui crée des données de test réalistes
- [ ] 5 users fictifs avec noms/emails anonymes
- [ ] ~50 trips répartis sur 2 semaines avec GPS points réalistes
- [ ] Badges débloqués, streaks en cours
- [ ] Utile pour démo, screenshots, dev local

### Dependabot / Renovate

- [ ] Config Renovate ou Dependabot pour auto-update des deps
- [ ] PRs automatiques avec changelog
- [ ] Auto-merge si CI passe pour les patches

---

## v2.3 — Sécurité & DX

### Sécurité

- [ ] Content-Security-Policy header strict
- [ ] `bun audit` dans la CI (ou npm audit)
- [ ] Documenter la procédure de rotation des secrets (VAPID, auth secret, DB password)
- [ ] Pen test checklist automatisée (OWASP top 10)

### Précision des calculs

- [ ] Migrer colonnes `real` → `numeric(10,3)` pour CO₂ et fuel
- [ ] Migrer `moneySavedEur` → `numeric(10,2)`
- [ ] Script de migration des données existantes
- [ ] Tests de précision sur les agrégations SUM

### DX

- [ ] API docs auto-générées (OpenAPI/Swagger depuis routes Hono + Zod)
- [ ] Dev containers (docker-compose pour dev en 1 commande)
- [ ] Storybook pour les composants UI
- [ ] Dead code analysis automatique dans la CI

---

## v3.0+ — Features (après consolidation)

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
- i18n (multi-langue)
