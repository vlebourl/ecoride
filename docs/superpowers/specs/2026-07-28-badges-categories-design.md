# Badges — nouveaux paliers, catégories et défis glissants

**Date** : 2026-07-28
**Statut** : spec validée, prête pour le plan d'implémentation

---

## Problème

Les 13 badges actuels couvrent 5 axes cumulatifs à vie (trajets, km, CO₂, streak, argent).
Trois défauts :

1. **Échelles trouées** — un seul palier pour l'argent, aucun pour le carburant, et un
   écart de 900 kg entre `co2_100kg` et `co2_1t`.
2. **Les badges streak sont sur `currentStreak`** alors que `computeStreak()` renvoie aussi
   `longest`. Conséquence : une série cassée ne retire rien tout de suite (car
   `reevaluateBadges` ne tourne qu'à la suppression d'un trajet), mais le jour où
   l'utilisateur supprime un trajet quelconque, `streak_30` disparaît sans rapport avec
   la suppression. Incohérent dans les deux sens.
3. **Aucun objectif court terme** — tous les seuils sont à vie, donc après quelques mois
   plus rien n'est atteignable à court terme.

L'UI aggrave le tout : `ProfileBadgesSection` et `StatsBadgesSection` sont la même grille
copiée deux fois, sans regroupement, et les libellés sont du français en dur dans
`shared/types.ts` alors que `client/src/i18n/locales/en.ts` existe.

## Contrainte structurante

`reevaluateBadges()` révoque un badge dont le prédicat redevient faux après suppression
d'un trajet. **Tout badge doit donc être une fonction pure d'agrégats recalculables** —
pas d'événement daté. Cette contrainte est conservée telle quelle : `BADGE_THRESHOLDS`
garde sa forme `Record<BadgeId, (s: UserStats) => boolean>`, seul `UserStats` s'élargit.

## Calibration

Chiffres réels de référence au 2026-07-28 : **1 159,8 km**, **187,5 kg CO₂**,
**18 km/h** de moyenne, sur une fenêtre de 19 semaines (premier commit du repo :
2026-03-21).

Rythme dérivé : ~61 km/semaine, ~10 kg CO₂/semaine, ~4,3 L/semaine, ~7,5 €/semaine.

> **Hypothèse CONFIRMÉE le 2026-07-28** : aucun trajet antérieur à mars 2026 n'a été
> importé. La fenêtre de 19 semaines est donc valide et la calibration tient.
> Données réelles complémentaires : 137 trajets (7,4/semaine), série max 4 jours.

---

## Modèle temporel

Le backend est **UTC-only par décision explicite et testée** :

- `server/src/lib/streaks.ts:13` — « Backend calculations stay UTC-only. User timezone is
  a presentation concern handled in the frontend from the saved profile setting. »
- `server/src/auth/timezone.test.ts:18` — `it("ignores timezone headers because backend
processing is UTC-only")`, et `timezoneMiddleware` jette délibérément `x-timezone`.

Cette spec **conserve** cette décision, avec **une seule exception assumée** :

| Ce qui est calculé                                         | Fuseau    | Pourquoi                                                                                        |
| ---------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Records jour / semaine / mois, mois actifs, défis, streaks | **UTC**   | Cohérence avec `computeStreak`; l'écart ne touche que les trajets à cheval sur minuit           |
| `weekend_20`, `all_week` (jour de la semaine)              | **UTC**   | Même raison                                                                                     |
| `early_bird`, `night_owl` (heure de la journée)            | **LOCAL** | En UTC, « avant 7 h » devient « avant 9 h » à Paris en été : le badge serait factuellement faux |

Une heure de la journée est intrinsèquement locale — c'est le seul cas où l'UTC produit
un badge dont le libellé ment. Le `user.timezone` peut être nul : dans ce cas on retombe
sur `DEFAULT_TIMEZONE` via `normalizeTimezone()` (`server/src/lib/timezone.ts`).

## Les trois strates

| Strate                | Exemple                         | Stockage                    | Reset                           |
| --------------------- | ------------------------------- | --------------------------- | ------------------------------- |
| **Défis**             | 32 / 50 km cette semaine        | aucun, calculé à la lecture | automatique (fenêtre glissante) |
| **Constance**         | objectif hebdo atteint 10×      | `achievements`              | jamais                          |
| **Paliers / records** | meilleur mois ≥ 250 km, 1 t CO₂ | `achievements`              | jamais                          |

Un badge qui reset n'est pas un accomplissement mais un objectif en cours : il a un état
(32/50), pas une date de déblocage. Le stocker imposerait une colonne période, un index
unique et une UI affichant N fois le même badge. Calculé à la lecture depuis la fenêtre
courante, le reset est gratuit.

---

## Catalogue — 46 badges permanents, 6 catégories

Les 13 badges existants **gardent leur id** : aucune migration de données.
Les 33 nouveaux sont en **gras**.

### 🚴 Volume — 12

| id              | seuil                 | icône |
| --------------- | --------------------- | ----- |
| `first_trip`    | 1 trajet              | 🚴    |
| `trips_10`      | 10 trajets            | 🔟    |
| `trips_50`      | 50 trajets            | 🏅    |
| `trips_100`     | 100 trajets           | 💯    |
| **`trips_250`** | 250 trajets (~4 mois) | 🎖️    |
| **`trips_500`** | 500 trajets (~1 an)   | 🏆    |
| `km_100`        | 100 km                | 🛤️    |
| `km_500`        | 500 km                | 🗺️    |
| `km_1000`       | 1 000 km              | 🌍    |
| **`km_2500`**   | 2 500 km (~8 mois)    | 🧭    |
| **`km_5000`**   | 5 000 km (~20 mois)   | 🛰️    |
| **`km_10000`**  | 10 000 km (~3 ans)    | 🌐    |

### 🌱 Impact — 13

| id               | seuil                | icône |
| ---------------- | -------------------- | ----- |
| `co2_10kg`       | 10 kg CO₂            | 🌱    |
| `co2_100kg`      | 100 kg               | 🌳    |
| **`co2_250kg`**  | 250 kg (~6 semaines) | 🌿    |
| **`co2_500kg`**  | 500 kg (~7 mois)     | 🍃    |
| `co2_1t`         | 1 000 kg (~20 mois)  | 🌲    |
| **`fuel_25l`**   | 25 L économisés      | ⛽    |
| **`fuel_50l`**   | 50 L                 | 🛢️    |
| **`fuel_100l`**  | 100 L (~1 mois)      | 🚫    |
| **`fuel_250l`**  | 250 L (~9 mois)      | 🏭    |
| `money_100`      | 100 €                | 💰    |
| **`money_250`**  | 250 € (~3,5 mois)    | 💶    |
| **`money_500`**  | 500 € (~10 mois)     | 💸    |
| **`money_1000`** | 1 000 € (~2 ans)     | 💎    |

### 🔥 Régularité — 9

**Tous les badges streak passent de `currentStreak` à `longestStreak`.** Une série de
30 jours réalisée en janvier reste un accomplissement en juillet.

| id                     | seuil                            | icône |
| ---------------------- | -------------------------------- | ----- |
| **`streak_3`**         | 3 jours consécutifs              | 🌤️    |
| `streak_7`             | 7 jours                          | 🔥    |
| **`streak_14`**        | 14 jours                         | 🌗    |
| `streak_30`            | 30 jours                         | ⚡    |
| **`streak_60`**        | 60 jours (2× le record de l'app) | 🌟    |
| **`months_active_6`**  | 6 mois civils avec ≥ 1 trajet    | 📆    |
| **`months_active_12`** | 12 mois civils                   | 🎂    |
| **`weekly_goal_10`**   | objectif hebdo atteint 10 fois   | 🎯    |
| **`monthly_goal_3`**   | objectif mensuel atteint 3 fois  | 🗓️    |

Les deux derniers sont la strate « constance » : ils rendent permanent l'effort fourni
sur les défis glissants, qui eux ne laissent aucune trace.

### 🏆 Records — 5

| id            | seuil                     | icône |
| ------------- | ------------------------- | ----- |
| **`day_30`**  | meilleure journée ≥ 30 km | ☀️    |
| **`day_50`**  | meilleure journée ≥ 50 km | 🌞    |
| **`trip_25`** | plus long trajet ≥ 25 km  | 🚀    |
| **`trip_50`** | plus long trajet ≥ 50 km  | 🛫    |
| **`trip_2h`** | plus long trajet ≥ 2 h    | ⏱️    |

> Les records semaine/mois (`week_100`, `month_250`) sont **retirés** du catalogue : ils
> feraient doublon avec les défis glissants, qui disent la même chose avec une barre de
> progression vivante.

### 🕐 Habitudes — 4

`early_bird` et `night_owl` lisent l'**heure locale** via `user.timezone`.
`weekend_20` et `all_week` restent en **UTC** comme le reste du backend — l'écart ne
concerne que les trajets à cheval sur minuit. Voir « Modèle temporel » ci-dessous.

| id               | seuil                                           | icône |
| ---------------- | ----------------------------------------------- | ----- |
| **`early_bird`** | 10 trajets démarrés avant 7 h                   | 🌅    |
| **`night_owl`**  | 10 trajets démarrés après 21 h                  | 🦉    |
| **`weekend_20`** | 20 trajets samedi ou dimanche                   | 🎒    |
| **`all_week`**   | ≥ 1 trajet sur chacun des 7 jours de la semaine | 📅    |

### ⚡ Performance — 3

Sur le **meilleur trajet**, pas la moyenne à vie : à 18 km/h de moyenne, des seuils à
20 ou 25 km/h seraient hors d'atteinte à vie. Garde-fou : **distance minimale de 5 km**,
sinon une descente de 500 m décroche le badge.

| id             | seuil                     | icône |
| -------------- | ------------------------- | ----- |
| **`speed_20`** | meilleur trajet ≥ 20 km/h | ⚡    |
| **`speed_22`** | ≥ 22 km/h                 | 💨    |
| **`speed_25`** | ≥ 25 km/h                 | 🔥    |

---

## Défis glissants

Seuils **fixes et partagés**, pas configurables ni adaptatifs : comparables entre
utilisateurs, aucune UI de réglage, aucun effet de seuil qui s'effondre après une semaine
de vacances.

| Défi                                | Objectif principal | Compteurs secondaires           |
| ----------------------------------- | ------------------ | ------------------------------- |
| **Semaine** (lundi → dimanche, UTC) | **50 km**          | trajets, jours actifs (/4), CO₂ |
| **Mois** (mois civil, UTC)          | **250 km**         | trajets, jours actifs, CO₂      |

Le défi CO₂ est une transformation linéaire du défi km (facteur ADEME constant) : il
afficherait toujours le même pourcentage. Il est donc **compteur secondaire**, pas
barre de progression — sinon deux barres disent la même chose.

```
DÉFI DE LA SEMAINE                    4 jours restants
████████████░░░░░░░░  32 / 50 km
  6 trajets · 3 / 4 jours actifs · 7,4 kg CO₂
```

---

## Implémentation serveur

### UserStats

Passe de 5 à 16 champs. `BADGE_THRESHOLDS` garde exactement sa forme actuelle.
`currentStreak` **disparaît** de `UserStats` : plus aucun badge ne s'appuie dessus une
fois les streaks passés sur `longest`. Il reste calculé par `computeStreak()` pour
l'affichage des stats, simplement il n'entre plus dans l'évaluation des badges.

```ts
export interface UserStats {
  // existants
  totalDistanceKm: number;
  totalCo2SavedKg: number;
  totalMoneySavedEur: number;
  tripCount: number;
  // nouveaux
  longestStreak: number;
  totalFuelSavedL: number;
  maxTripDistanceKm: number;
  maxTripDurationSec: number;
  maxTripSpeedKmh: number; // trajets ≥ 5 km uniquement
  maxDayDistanceKm: number;
  monthsActive: number;
  earlyTripCount: number; // départ < 7 h locale
  nightTripCount: number; // départ ≥ 21 h locale
  weekendTripCount: number;
  distinctWeekdayCount: number; // 7 → all_week
  weeklyGoalsMet: number;
  monthlyGoalsMet: number;
}
```

### Trois requêtes

- **A** — agrégat une-ligne : les sommes existantes, plus `SUM(fuelSavedL)`,
  `MAX(distanceKm)`, `MAX(durationSec)`, `MAX(distanceKm / durationSec)` filtré sur
  `distanceKm >= 5`, et des `COUNT(*) FILTER (WHERE ...)` pour les habitudes : heure
  **locale** < 7 et ≥ 21 (`EXTRACT(hour FROM started_at AT TIME ZONE $tz)`), week-end et
  `COUNT(DISTINCT dow)` en **UTC**.
- **B** — sommes par **jour UTC** (`DATE(started_at AT TIME ZONE 'UTC')`, même expression
  que `computeStreak`) : une ligne par jour actif, ≤ 730 après deux ans.
- **C** — `computeStreak()`, inchangé, dont on utilise désormais `longest`.

### computeDerivedStats — fonction pure

Les records journée, les mois actifs, les compteurs d'objectifs atteints et l'état des
deux défis courants se replient depuis **B**, en TypeScript, dans une fonction pure :

```ts
computeDerivedStats(
  dailyRows: { day: string; distanceKm: number; co2Kg: number; tripCount: number }[],
  today: string,
): DerivedStats
```

Motif : la logique risquée (frontières de semaine ISO, changement d'heure, fuseau
non-Paris) devient testable sans base de données — même pattern que
`computeStreakFromDates`, déjà présent dans le repo. Le paramètre `today` est injecté
plutôt que lu depuis l'horloge, pour que les tests soient déterministes.

Les défis courants n'ajoutent **aucune requête** : la semaine et le mois en cours sont
deux lignes de plus dans le même repli. Ils sont exposés dans la réponse `/api/stats`.

---

## Implémentation client

- **`BadgeGrid`** — composant unique extrait de `ProfileBadgesSection` et
  `StatsBadgesSection`, qui sont aujourd'hui la même grille dupliquée. Groupé par
  catégorie, avec un compteur `7/11` par catégorie.
- **`shared/types.ts`** — `BADGES` gagne un champ `category`; nouvelle constante
  `BADGE_CATEGORIES` pour l'ordre d'affichage.
- **i18n** — les libellés passent de français en dur à des clés `badges.<id>.label`
  dans `fr.ts` et `en.ts` (46 × 2 entrées). Sans ça, 33 nouveaux libellés en dur
  aggravent le trou existant côté anglais.
- **`ChallengeCard`** — un seul composant avec une prop `compact` : version compacte sur
  le dashboard, version détaillée en tête de la section badges.

---

## Tests

- **`BADGE_THRESHOLDS`** — le fichier de tests existant suit déjà le pattern « seuil exact
  - juste en dessous ». Étendu aux 33 nouveaux badges.
- **`computeDerivedStats`** — repli semaine/mois, frontière lundi, passage à l'heure
  d'hiver, tableau vide.
- **Révocation** — un test par famille de nouveaux badges vérifiant que la suppression
  d'un trajet sous le seuil retire bien le badge (et, pour les streaks passés sur
  `longest`, qu'elle ne le retire **pas** à tort).
- **Garde-fou vitesse** — un trajet de 500 m à 40 km/h ne décroche pas `speed_25`.
- **e2e Playwright** — la section badges affiche les 6 catégories avec leurs compteurs;
  la carte défi affiche une barre de progression.

---

## Hors périmètre

- Objectifs configurables par l'utilisateur (roadmap v3.0) — les seuils sont fixes ici.
- Badges saisonniers accumulables (une ligne par période) — écarté, casse `BadgeId` statique.
- Badges non révocables — écarté, produit des badges fantômes après suppression de trajets.
- Dénivelé : `GpsPoint` ne porte que `lat`, `lng`, `ts`. Pas d'altitude, pas de badge grimpeur.

---

## Points ouverts

1. ~~**`trips_250` / `trips_500`**~~ — RÉSOLU 2026-07-28 : 137 trajets, soit 7,4/semaine.
   Les paliers posés au jugé tombent juste (~4 mois et ~1 an). Inchangés.
2. ~~**`streak_14` / `streak_100`**~~ — RÉSOLU 2026-07-28. Données réelles : série max 4
   (record de l'app : 30). `streak_100` remplacé par `streak_60`, soit le double du record
   actuel. Ancienne note : 100 jours est peut-être
   hors d'atteinte; 60 serait un repli raisonnable.
3. ~~**Import historique**~~ — RÉSOLU 2026-07-28 : aucun import antérieur à mars 2026.
   La calibration est valide.
