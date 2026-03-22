# ecoRide — Roadmap & Audit

Audit réalisé le 2026-03-22. Objectif : test grandeur nature lundi 2026-03-23.

---

## v1.0.0 — Livré le 2026-03-22

- [x] B1 — Vrai GPS tracking (PR #6)
- [x] B2 — Badge auto-unlock (PR #5)
- [x] B3 — CO₂ live depuis profil utilisateur (PR #3)
- [x] I1 — Page 404 (PR #4)
- [x] I2 — Error Boundary React (PR #4)
- [x] I3 — Validation startedAt < endedAt (PR #2)
- [x] I4 — Limite distanceKm max 500 (PR #2)
- [x] I6 — Empty states Dashboard/Leaderboard/Stats (PR #7)
- [x] I7 — Stats chart charge tous les trajets de la semaine (PR #10)
- [x] S7 — Défaut conso aligné client/serveur 7 L/100km (PR #3)
- [x] Palette Luminous Carbon + rebrand ecoRide (PR #1)
- [x] Leaderboard pour tous les utilisateurs — LEFT JOIN (PR #8)
- [x] Badge revocation à la suppression de trajet (PR #9)
- [x] Dashboard redesign — CTA + résumé du jour + streak + impact meter (PR #11)
- [x] Suppression de trajet via bottom sheet
- [x] Centrage carte sur position réelle
- [x] Logo app sur login/welcome
- [x] Version display dans le profil
- [x] Auto-purge cache SW au changement de version (PR #13)
- [x] Fix CI : vitest au lieu de bun test (PR #1)
- [x] Runner self-hosted dédié ecoride pour Coolify deploy

---

## v1.1.0 — En cours

### Prioritaires pour le test de demain

- [ ] **Erreur sauvegarde trajet** — Si le réseau coupe, l'utilisateur ne voit pas d'erreur.
  → Afficher un message d'erreur + bouton réessayer dans TripPage.

- [ ] **Bouton Notifications dans profil** — Le scaffolding existe mais ne fait rien.
  → Soit brancher le flow push (subscribe/unsubscribe), soit retirer le bouton.

- [ ] **Saisie manuelle : vitesse fixe 15 km/h** — La durée estimée est arbitraire.
  → Ajouter un champ durée optionnel ou affiner l'estimation.

### Restants de la roadmap initiale

- [ ] **I5 — Timezone des streaks**
  → Stocker le timezone utilisateur ou accepter un paramètre timezone.

- [ ] **S1 — Suppression de compte (RGPD)**
  → Endpoint DELETE + export JSON + UI dans profil.

- [ ] **S2 — Politique de confidentialité**
  → Page /privacy + bandeau consentement.

- [ ] **S3 — Accessibilité (a11y)**
  → Audit WCAG 2.1 AA et corrections progressives.

- [ ] **S4 — Rate limiting**
  → Middleware rate-limit sur les endpoints API.

- [ ] **S5 — Lazy loading des routes**
  → React.lazy() + Suspense pour les routes secondaires.

- [ ] **S6 — Mode offline / file d'attente**
  → IndexedDB + sync au retour réseau.

---

## Ce qui fonctionne bien

- Persistence PostgreSQL (CRUD complet, rien mocké)
- Calculs CO₂ / argent / essence (formules ADEME, audit trail prix carburant)
- Prix essence API officielle data.economie.gouv.fr (cache 1h + fallback)
- Auth Google OAuth + email/password (Better Auth, sessions DB, cookies secure)
- PWA manifest, icons, service worker, installable + auto-purge cache
- Profil véhicule configurable (type carburant, conso, opt-out leaderboard)
- Leaderboard multi-utilisateur (agrégation SQL, LEFT JOIN, respecte opt-out)
- Docker multi-stage + Coolify auto-deploy via runner self-hosted
- Validation Zod (max distance, durée, dates ordonnées)
- CI GitHub Actions : typecheck + vitest
- Charte graphique Luminous Carbon (charcoal + leaf green + white)
- GPS réel avec watchPosition, haversine, wake lock
- Badges auto-unlock + revocation (12 seuils)
- Dashboard = hub quotidien (CTA, résumé jour, streak, impact meter)
- Suppression de trajet via bottom sheet
- Error boundary + page 404
- Version display dans le profil
