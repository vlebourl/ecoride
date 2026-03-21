# EcoRide — Cahier des charges v1.0

**Date :** 2026-03-21  
**Statut :** Validé — prêt pour développement  
**Dossier projet :** `~/Documents/Obsidian/Lyra/Projets/velo-tracker/`  
**URL de production :** `velo.tiarkaerell.com` (via Coolify)

---

## 1. Concept

**EcoRide** est une PWA mobile-first permettant de suivre ses trajets à vélo et de visualiser les économies réalisées par rapport à la voiture de référence : CO2, argent, litres d'essence.

L'angle principal est **l'impact environnemental** (CO2 économisé), pas la performance sportive.

---

## 2. Fonctionnalités v1

### 2.1 Enregistrement de trajet
- Bouton "Démarrer un trajet" → active le GPS (Wake Lock API pour garder l'écran allumé)
- Tracking GPS en temps réel → calcul de la distance à l'arrêt
- Bouton "Terminer" → affichage du résumé immédiat
- Possibilité de saisie manuelle de distance (si GPS non souhaité)

### 2.2 Calcul des économies (par trajet et cumulatif)
À chaque trajet, calcul automatique basé sur le profil véhicule de l'utilisateur :
- 🌱 **CO2 économisé** (kg) = distance × conso × 2.31 kg CO2/litre (facteur ADEME)
- 💶 **Argent économisé** (€) = distance × conso × prix_essence_local / 100
- 💧 **Litres économisés** (L) = distance × conso / 100

**Prix de l'essence :** récupéré dynamiquement via l'API officielle française  
→ `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/`  
Géolocalisé (stations les plus proches). Fallback : prix moyen national.

### 2.3 Dashboard principal
Écrans principaux (navigation bottom bar) :

**🏠 Dashboard**
- Résumé du jour / de la semaine / du mois (switcher)
- Compteurs : km, CO2 (kg), € économisés
- Comparatif mois N vs mois N-1
- **Impact Meter** (voir §2.4)
- Streak actuel + objectif mensuel

**🚴 Trajet actif**
- Carte GPS en temps réel
- Distance + durée + économies en cours

**📊 Stats**
- Graphiques semaine / mois / année
- Évolution CO2, €, km
- Badges / achievements débloqués

**🏆 Classement**
- Leaderboard CO2 économisé (opt-out, actif par défaut)
- Peut être désactivé dans les paramètres

**👤 Profil / Paramètres**
- Véhicule de référence (modèle, carburant, conso mixte, kilométrage)
- Rappels push (heure + jours de semaine)
- Préférences classement (opt-out)
- Compte Google (déconnexion)

### 2.4 Impact Meter (composant visuel clé)
Pièce maîtresse du dashboard — **distinct du système de gamification**.

Jauge/cercle dynamique qui compare le CO2 économisé cumulatif à des références parlantes :
- 🌳 X arbres plantés (~21 kg CO2/arbre/an)
- 🚗 Trajet Paris–Lyon en voiture (~45 kg CO2)
- ✈️ Vol Paris–New York (aller, ~400 kg CO2/passager)
- ⛽ Pleins d'essence (50L SP95 ≈ 115 kg CO2)

Le visuel se remplit progressivement vers la prochaine référence. Une fois atteint, il se vide et passe à l'étape suivante (progression continue).

### 2.5 Gamification
- **Streaks** : jours consécutifs avec un trajet (reset si jour manqué)
- **Badges paliers** (débloqués une seule fois) :
  - Premier trajet, 10 trajets, 50 trajets, 100 trajets
  - 100 km, 500 km, 1000 km
  - 10 kg CO2, 100 kg CO2, 1 tonne CO2
  - 1 semaine de streak, 1 mois de streak
- **Objectif mensuel** : km ou CO2, configurable, barre de progression sur le dashboard

### 2.6 Multi-utilisateurs
- Authentification via **Google OAuth** (Better Auth)
- Chaque utilisateur a son propre profil véhicule et ses propres stats
- Classement partagé entre tous les utilisateurs (opt-out)

### 2.7 Rappels
- Push notifications PWA (Web Push API)
- Configurables : heure + jours de la semaine
- Message type : "Tu n'as pas encore enregistré de trajet aujourd'hui 🚴"

---

## 3. Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React + Vite + vite-plugin-pwa |
| Styles | TailwindCSS |
| Auth | Better Auth + Google OAuth |
| Backend | Bun + Hono (ou Fastify) — API REST |
| Base de données | PostgreSQL |
| ORM | Drizzle ORM |
| Déploiement | Coolify (self-hosted) |
| Domain | velo.tiarkaerell.com |

### API externes
- **Prix carburants FR** : `data.economie.gouv.fr` (open data, pas de clé API)
- **GPS** : Web Geolocation API (navigateur natif)
- **Push** : Web Push API + VAPID keys (self-hosted)

---

## 4. Design

- **Mode :** Dark mode natif OLED uniquement (v1)
- **Couleur principale :** Vert émeraude `#00C896`
- **Fond :** Noir profond `#0A0A0A` + surfaces `#141414`
- **Texte :** Blanc `#FFFFFF` + gris `#8A8A8A`
- **Inspiration :**
  - Finary (données financières propres, lisibles, chiffres en grand)
  - Duolingo (streaks, badges, engagement)
  - Apple Fitness (anneaux de progression)
- **Mobile-first** — responsive desktop secondaire

### Génération UI
Utiliser **Google Stitch MCP** pour générer les maquettes de chaque écran, puis exporter HTML/CSS comme base de travail pour Claude Code.

---

## 5. Architecture de données (schéma simplifié)

```
users
  id, google_id, email, name, avatar_url
  vehicle_model, fuel_type, consumption_l100, mileage
  leaderboard_opt_out, reminder_enabled, reminder_time, reminder_days
  created_at

trips
  id, user_id
  distance_km, duration_sec
  co2_saved_kg, money_saved_eur, fuel_saved_l
  fuel_price_eur, started_at, ended_at
  gps_points (JSON, optionnel)

achievements
  id, user_id, badge_id, unlocked_at

push_subscriptions
  id, user_id, endpoint, p256dh, auth
```

---

## 6. Hors scope v1

- Export PDF/CSV (v2)
- Historique trajets avec carte détaillée
- Multi-vélos par utilisateur
- Détection automatique ville/route (vélo = conso mixte unique)
- Météo
- Desktop design soigné
- Mode hors-ligne avancé

---

## 7. Workflow de développement prévu

1. **Scaffold + maquettes en parallèle** → Claude Code lance simultanément l'Agent Architecte et l'Agent Design (Stitch)
2. **Features** → Claude Code en mode team of agents une fois les interfaces définies
3. **Déploiement** → Coolify (Docker compose)

---

## 8. Instructions de travail pour Claude Code

⚠️ **Ces instructions sont impératives et non négociables.**

### Mode de travail : Autonomie totale

**Tu travailles en autonomie complète.** Tu n'attends pas de validation humaine entre chaque étape. Tu planifies, tu exécutes, tu itères — seul.

La seule chose attendue : un **rapport de fin de session** synthétique (ce qui a été fait, ce qui reste, les blockers éventuels).

### Team of agents obligatoire

**Tu dois utiliser une équipe d'agents en parallèle** pour accélérer le développement. Répartition recommandée :

- **Agent Architecte** : structure du projet, schema DB, API contracts, types TypeScript partagés
- **Agent Design (Stitch)** : génération des maquettes UI via Google Stitch MCP (`stitch.googleapis.com/mcp`) — un écran à la fois, export HTML/CSS transmis à l'agent Frontend. Doit couvrir les 5 écrans principaux : Dashboard, Trajet actif, Stats, Classement, Profil. Palette imposée : fond `#0A0A0A`, accent `#00C896`, dark mode OLED.
- **Agent Backend** : Bun/Hono, routes API, auth Better Auth, intégration PostgreSQL/Drizzle, Web Push
- **Agent Frontend** : React + Vite, composants UI TailwindCSS — implémente les maquettes Stitch reçues de l'Agent Design
- **Agent Features** : GPS tracking, calculs économies, Impact Meter, gamification, prix carburants API
- **Agent DevOps** : Docker compose, Coolify config, variables d'environnement, CI

Les agents travaillent en parallèle dès que les interfaces sont définies. Ne pas attendre qu'un agent finisse pour en démarrer un autre.

### Prises de décision autonomes

Tu prends les décisions techniques toi-même sans demander. En cas de choix entre deux options équivalentes, choisis la plus simple. Documente ton choix dans un commentaire ou dans un `DECISIONS.md` à la racine du projet.

Si un vrai blocage externe se présente (credentials manquants, accès impossible), tu le notes dans le rapport final — tu ne bloques pas le reste du travail pour autant.

### Qualité attendue

- Code prêt pour production (pas de TODO non résolus dans le code livré)
- Tests unitaires sur les fonctions de calcul (CO2, €, litres)
- Types TypeScript stricts
- README à jour à chaque session

---

*CDC finalisé le 2026-03-21 avec Vincent. Prêt pour lancement du dev.*
