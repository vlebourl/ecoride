# ecoRide — Roadmap & Audit

Audit réalisé le 2026-03-22. Objectif : test grandeur nature lundi 2026-03-23.

---

## 🔴 Bloquants (avant test lundi)

- [ ] **B1 — Brancher le vrai GPS dans TripPage**
  `TripPage.tsx` utilise `setInterval` + `Math.random()` pour simuler les positions.
  Le vrai hook `useGpsTracking.ts` (watchPosition, haversine, wake lock) existe dans `/frontend/`
  mais n'est pas intégré dans `/client/`.
  → Intégrer `useGpsTracking` + `useWakeLock` + haversine dans TripPage.
  Fichiers : `client/src/pages/TripPage.tsx`, `frontend/src/hooks/useGpsTracking.ts`

- [ ] **B2 — Implémenter le déblocage automatique des badges**
  Table `achievements` et GET endpoint existent, mais aucune logique d'unlock.
  Pas de POST, pas de trigger après création de trajet. Les badges restent vides.
  → Ajouter évaluation des badges après chaque `POST /api/trips` (first_trip, km_100, co2_10kg, streak_7…).
  Fichiers : `server/src/routes/trips.routes.ts`, `server/src/routes/achievements.routes.ts`, `shared/types.ts`

- [ ] **B3 — Utiliser la conso profil pour l'affichage CO₂ temps réel**
  `TripPage.tsx:69` hardcode `distance * 0.065 * 2.31` (6.5 L/100km).
  → Récupérer `consumptionL100` du profil utilisateur et l'utiliser dans le calcul live.
  Fichiers : `client/src/pages/TripPage.tsx`, `client/src/hooks/queries.ts`

---

## 🟠 Importants (fort impact UX / fiabilité)

- [ ] **I1 — Ajouter une page 404**
  Routes invalides → écran blanc. Ajouter un catch-all dans React Router.
  Fichier : `client/src/App.tsx`

- [ ] **I2 — Ajouter un Error Boundary React**
  Erreur JS dans un composant → crash complet, écran blanc.
  → Wrapper `<ErrorBoundary>` autour des routes dans App.tsx.
  Fichier : `client/src/App.tsx`

- [ ] **I3 — Valider startedAt < endedAt côté serveur**
  Le serveur accepte un trajet où la date de fin est avant la date de début.
  → Ajouter `.refine()` dans le schéma Zod.
  Fichier : `server/src/validators/trips.ts`

- [ ] **I4 — Limiter distanceKm max**
  `z.number().positive()` accepte 99 999 km. Ajouter `.max(500)`.
  Fichier : `server/src/validators/trips.ts`

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

- [ ] **S7 — Aligner le défaut de consommation client/serveur**
  Client preview : 6.5 L/100km. Serveur fallback : 7 L/100km.
  → Unifier à 7 L/100km ou exposer le défaut serveur au client.
  Fichiers : `client/src/pages/TripPage.tsx`, `server/src/routes/trips.routes.ts`

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
- Docker multi-stage + Coolify auto-deploy
- Validation Zod sur tous les endpoints
