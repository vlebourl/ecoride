# ecoRide — Roadmap

---

## v1.0–v1.3 — Livrés le 2026-03-22/23

GPS tracking, badges, leaderboard, push notifications, offline queue, privacy policy,
RGPD (export/suppression), accessibilité, rate limiting, lazy loading, pull-to-refresh,
auto-bump CI/CD, Playwright smoke tests, palette Luminous Carbon.

Voir AUDIT-v1.2.md pour le détail des 31/35 findings corrigés.

---

## v1.4 — Classement enrichi

### Filtres période (backend prêt, UI à ajouter)
- [ ] Switcher Semaine / Mois / Tout temps sur la page Classement
  → Permet à un nouveau venu de gagner la semaine même s'il est loin au cumul

### Catégories de classement
- [ ] **Meilleure série (streak)** — classement par jours consécutifs
  → Récompense la régularité, pas le volume
- [ ] **Plus de trajets** — classement par nombre de trips
  → Récompense la fréquence (10 petits trajets > 1 gros)
- [ ] **Vitesse moyenne** — classement par km/h moyen
  → Récompense la performance (nécessite calcul distance/durée)
  → Un petit rouleur rapide peut battre un gros rouleur lent

### UI
- [ ] Onglets ou dropdown pour changer de catégorie (CO₂ / Streak / Trajets / Vitesse)
- [ ] Icône distincte par catégorie

---

## v1.5 — Social & engagement

- [ ] **Défis entre amis** — "Je te défie de faire 50 km cette semaine"
- [ ] **Réactions sur les trajets** — emoji/like sur les trajets des autres
- [ ] **Fil d'activité** — voir les derniers trajets de tous les utilisateurs
- [ ] **Partager son impact** — bouton Web Share API pour envoyer ses stats CO₂

---

## v1.6 — UX avancée

- [ ] **Animation de félicitation** — confettis quand un badge est débloqué
- [ ] **Objectif mensuel configurable** — l'objectif 100 km est fixe, le rendre modifiable
- [ ] **Haptic feedback** — vibration sur les actions principales
- [ ] **prefers-reduced-motion** — respecter les préférences d'accessibilité
- [ ] **Thème clair** — option light mode

---

## v2.0 — Technique & qualité

- [ ] **Tests serveur** — vitest pour les routes API, badges, leaderboard, calculs
- [ ] **ESLint + Prettier** — config + pre-commit hooks
- [ ] **Float precision** — migrer real → numeric pour CO₂ et €
- [ ] **Timezone persistée** — stocker le timezone dans le profil utilisateur
- [ ] **Dockerfile optimisé** — production-only node_modules (sans casser drizzle-kit)
- [ ] **Monitoring** — Sentry pour le tracking d'erreurs

---

## Audit résiduel (P3 non corrigés)

Voir AUDIT-v1.2.md pour le contexte complet.

- Haptic feedback (prévu v1.6)
- prefers-reduced-motion (prévu v1.6)
- Float precision real → numeric (prévu v2.0)
- Timezone persistée dans le profil (prévu v2.0)
- Tests serveur (prévu v2.0)
- ESLint/Prettier (prévu v2.0)
