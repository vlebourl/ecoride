# ecoRide — Roadmap

---

## v1.0–v1.6 — Livrés

GPS tracking, badges, leaderboard (5 catégories + périodes), push notifications,
offline queue, privacy policy, RGPD, accessibilité, rate limiting, lazy loading,
pull-to-refresh, auto-bump CI/CD, Playwright smoke tests, palette Luminous Carbon.

---

## v2.0 — Qualité & consolidation (en cours)

Focus : nettoyer le code, tester, linter, monitorer. Pas de nouvelles features.

### Tests serveur
- [ ] vitest pour les routes API (trips CRUD, stats, leaderboard, achievements)
- [ ] Tests badge unlock/revocation avec données réelles
- [ ] Tests calculs CO₂/argent/fuel
- [ ] Tests streak computation edge cases
- [ ] Tests leaderboard catégories (co2/streak/trips/speed/money)
- [ ] Tests rate limiting
- [ ] Tests validation Zod (trips, users, push)
- [ ] Objectif : coverage > 80% sur server/src/

### ESLint + Prettier
- [ ] Config ESLint (flat config) pour client + server + shared
- [ ] Config Prettier
- [ ] Pre-commit hook (husky + lint-staged)
- [ ] Fix toutes les erreurs de linting existantes
- [ ] Ajouter le lint à la CI

### Monitoring
- [ ] Intégrer Sentry (ou alternative) côté client
- [ ] Capturer les erreurs non catchées + les rejections de promesses
- [ ] Source maps uploadées pour stack traces lisibles
- [ ] Alertes sur les erreurs critiques

### Précision des calculs
- [ ] Migrer les colonnes real → numeric(10,3) pour CO₂ et fuel
- [ ] Migrer moneySavedEur → numeric(10,2)
- [ ] Migration Drizzle + script de migration des données existantes
- [ ] Tests de précision sur les agrégations (SUM de numeric vs real)

### Nettoyage
- [ ] Supprimer le code mort (imports inutilisés, fonctions orphelines)
- [ ] Vérifier que tous les TODO/FIXME sont résolus
- [ ] Mettre à jour les screenshots README
- [ ] Mettre à jour DECISIONS.md avec les choix architecturaux récents

---

## v2.1+ — Features (après consolidation)

- Défis entre amis
- Fil d'activité
- Partager son impact (Web Share API)
- Objectif mensuel configurable
- Thème clair
- Haptic feedback + confettis badges
- Carte de tous les trajets
- i18n
