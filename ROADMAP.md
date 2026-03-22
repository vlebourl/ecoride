# ecoRide — Roadmap & Audit

Audit réalisé le 2026-03-22. Objectif : test grandeur nature lundi 2026-03-23.

---

## 🔴 Bloquants (avant test lundi)

- [x] **B1 — Brancher le vrai GPS dans TripPage** — PR #6, déployé 2026-03-22
  watchPosition + haversine + wake lock + gpsPoints envoyés au serveur.

- [x] **B2 — Implémenter le déblocage automatique des badges** — PR #5, déployé 2026-03-22
  Évaluation des 12 seuils après chaque trip, ON CONFLICT DO NOTHING.

- [x] **B3 — Utiliser la conso profil pour l'affichage CO₂ temps réel** — PR #3, déployé 2026-03-22
  Utilise `useProfile()` + `CO2_KG_PER_LITER`, fallback 7 L/100km (= serveur).

---

## 🟠 Importants (fort impact UX / fiabilité)

- [x] **I1 — Ajouter une page 404** — PR #4, déployé 2026-03-22
  Catch-all route + NotFoundPage.

- [x] **I2 — Ajouter un Error Boundary React** — PR #4, déployé 2026-03-22
  ErrorBoundary class component wrappant l'app dans main.tsx.

- [x] **I3 — Valider startedAt < endedAt côté serveur** — PR #2, déployé 2026-03-22
  `.refine()` Zod sur le schéma de création de trip.

- [x] **I4 — Limiter distanceKm max** — PR #2, déployé 2026-03-22
  `.max(500)` + `durationSec.min(1)`.

- [ ] **I5 — Timezone des streaks**
  `stats.routes.ts:56` calcule "aujourd'hui" en timezone serveur, pas utilisateur.
  → Stocker le timezone utilisateur ou accepter un paramètre timezone dans la requête.
  Fichiers : `server/src/routes/stats.routes.ts`, `server/src/db/schema/auth.ts`

- [ ] **I6 — Empty states (Dashboard, Leaderboard)**
  Dashboard et Leaderboard n'ont pas d'état "aucun trajet" pour un nouvel utilisateur.
  Fichiers : `client/src/pages/DashboardPage.tsx`, `client/src/pages/LeaderboardPage.tsx`

- [ ] **I7 — StatsPage : charger tous les trajets de la semaine**
  Le graphique hebdo est construit à partir de seulement 10 trips (page 1).
  → Utiliser un endpoint dédié ou augmenter la limite pour le graphique.
  Fichier : `client/src/pages/StatsPage.tsx`

---

## 🟡 Souhaitables (qualité, conformité, perf)

- [ ] **S1 — Suppression de compte (RGPD)**
  Pas d'endpoint `DELETE /api/user/profile` ni d'export de données.
  → Ajouter suppression + export JSON des données personnelles.
  Fichiers : `server/src/routes/users.routes.ts`, `client/src/pages/ProfilePage.tsx`

- [ ] **S2 — Politique de confidentialité**
  Aucune privacy policy, aucun bandeau cookies.
  → Ajouter une page /privacy et un bandeau de consentement.

- [ ] **S3 — Accessibilité (a11y)**
  Zéro `aria-label`, pas de `<label htmlFor>`, pas de navigation clavier, pas de rôles sémantiques.
  → Audit WCAG 2.1 AA et corrections progressives.
  Fichiers : tous les composants `client/src/`

- [ ] **S4 — Rate limiting**
  Aucune protection contre le spam sur les endpoints API.
  → Ajouter un middleware rate-limit (ex: hono-rate-limiter).
  Fichier : `server/src/index.ts`

- [ ] **S5 — Lazy loading des routes**
  Toutes les pages importées en synchrone → bundle plus gros.
  → `React.lazy()` + `Suspense` pour les routes secondaires.
  Fichier : `client/src/App.tsx`

- [ ] **S6 — Mode offline / file d'attente**
  PWA installable mais aucun offline queue : un trajet créé sans réseau est perdu.
  → Implémenter une file IndexedDB + sync au retour réseau.

- [x] **S7 — Aligner le défaut de consommation client/serveur** — résolu par PR #3
  Client et serveur utilisent maintenant 7 L/100km comme défaut.

---

## ✅ Ce qui fonctionne bien

- Persistence PostgreSQL (CRUD complet, rien mocké)
- Calculs CO₂ / argent / essence (formules ADEME, audit trail prix carburant)
- Prix essence API officielle data.economie.gouv.fr (cache 1h + fallback)
- Auth Google OAuth + email/password (Better Auth, sessions DB, cookies secure)
- PWA manifest, icons, service worker, installable
- Push notifications (VAPID, souscription, cron rappels)
- Profil véhicule configurable (type carburant, conso, opt-out leaderboard)
- Leaderboard (agrégation SQL réelle, respecte opt-out)
- Docker multi-stage + auto-deploy via CI
- Validation Zod sur tous les endpoints (+ contraintes max distance, durée, dates)
- CI GitHub Actions : typecheck + vitest (corrigé PR #1)
- Charte graphique Luminous Carbon (charcoal #1e272e + leaf green #2ecc71 + white)
- GPS réel avec watchPosition, haversine, wake lock
- Badges auto-unlock après chaque trajet (12 seuils)
- Error boundary + page 404
