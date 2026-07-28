# Badges — catégories, nouveaux paliers et défis glissants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire passer le catalogue de 13 à 46 badges répartis en 6 catégories, corriger les badges streak indexés sur la mauvaise métrique, et ajouter deux défis glissants hebdo/mensuel calculés à la lecture.

**Architecture:** `BADGE_THRESHOLDS` garde sa forme `Record<BadgeId, (s: UserStats) => boolean>` — on élargit `UserStats` de 5 à 16 champs plutôt que de changer le moteur. Les agrégats coûteux (records journée, mois actifs, objectifs atteints, défis courants) se replient en TypeScript depuis une seule requête « sommes par jour UTC », dans une fonction pure testable sans base. Côté client, la grille de badges dupliquée entre profil et stats devient un composant unique groupé par catégorie.

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, vitest, React 19, TailwindCSS v4, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-28-badges-categories-design.md`

## Global Constraints

- **Branche** : partir de `main` à jour (`git checkout main && git pull`), jamais commiter sur `main`. Une seule branche `feat/badges-categories` pour tout le plan, une PR à la fin.
- **Conventional commits** : `feat:` pour les tâches 1 à 8. Le message déclenche l'auto-bump.
- **Les 13 ids existants ne changent pas** : `first_trip`, `trips_10`, `trips_50`, `trips_100`, `km_100`, `km_500`, `km_1000`, `co2_10kg`, `co2_100kg`, `co2_1t`, `streak_7`, `streak_30`, `money_100`. Aucune migration de données.
- **Modèle temporel** : tout est en **UTC** (`DATE(started_at AT TIME ZONE 'UTC')`, même expression que `computeStreak`), **sauf** `early_bird` et `night_owl` qui lisent l'heure locale via `user.timezone`. C'est la seule exception à la règle « backend UTC-only » documentée dans `server/src/lib/streaks.ts:13`.
- **Tout badge est une fonction pure de `UserStats`** — jamais d'événement daté, sinon `reevaluateBadges()` ne peut pas le révoquer correctement.
- **Seuils des défis** : 50 km/semaine (lundi→dimanche), 250 km/mois (mois civil).
- **Garde-fou vitesse** : `maxTripSpeedKmh` ne considère que les trajets `distanceKm >= 5`.
- **Vérification à chaque tâche** : `bun run lint` et les tests de la tâche doivent passer avant chaque commit.
- **Exception typecheck, tâches 1 à 3** : `BadgeId` est dérivé des clés de `BADGES`, donc ajouter 33 ids casse mécaniquement `BADGE_THRESHOLDS` tant que les prédicats ne suivent pas. Le typecheck est **attendu rouge** aux tâches 1, 2 et 3, et **doit être vert à partir de la tâche 4** et pour toutes les suivantes. Ne pas « réparer » ce rouge en tâche 1 ou 2 — la tâche 4 le résout en supprimant le bloc dupliqué qui portait `currentStreak`.

---

## File Structure

**Créés :**

| Fichier                                          | Responsabilité                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/src/lib/derived-stats.ts`                | Fonction pure `computeDerivedStats()` : replie les sommes journalières en records semaine/mois, mois actifs, compteurs d'objectifs, et état des deux défis courants. Aucun accès DB. |
| `server/src/lib/__tests__/derived-stats.test.ts` | Tests de la fonction pure : frontières de semaine, changement d'heure, tableau vide.                                                                                                 |
| `client/src/components/badges/BadgeGrid.tsx`     | Grille de badges groupée par catégorie, avec compteur par catégorie. Remplace la duplication profil/stats.                                                                           |
| `client/src/components/badges/ChallengeCard.tsx` | Carte de défi, prop `compact` pour la version dashboard.                                                                                                                             |
| `client/e2e/badges-categories.spec.ts`           | e2e : 6 catégories affichées, barre de progression du défi.                                                                                                                          |

**Modifiés :**

| Fichier                                                  | Changement                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `shared/types.ts:113-129`                                | `BADGES` passe à 46 entrées avec un champ `category`; ajout de `BADGE_CATEGORIES` et du type `BadgeCategory`.          |
| `server/src/lib/badges.ts`                               | `UserStats` élargi, 33 prédicats ajoutés, streaks passés sur `longest`, agrégats A/B branchés dans les deux fonctions. |
| `server/src/lib/__tests__/badges.test.ts`                | `makeStats()` élargi, 33 badges × 2 cas ajoutés.                                                                       |
| `server/src/routes/stats.routes.ts`                      | La réponse expose `challenges`.                                                                                        |
| `client/src/components/profile/ProfileBadgesSection.tsx` | Délègue à `BadgeGrid`.                                                                                                 |
| `client/src/components/stats/StatsBadgesSection.tsx`     | Délègue à `BadgeGrid`, plus `ChallengeCard` en tête.                                                                   |
| `client/src/pages/DashboardPage.tsx`                     | `ChallengeCard` en version compacte.                                                                                   |
| `client/src/i18n/locales/fr.ts` et `en.ts`               | Clés des catégories et des défis.                                                                                      |

**Décision de périmètre — libellés des badges :** la spec prévoyait de basculer les libellés vers i18n. **Reporté**, pour une raison technique découverte au moment du plan : `server/src/routes/trips.routes.ts:138` construit le texte de la notification push avec `BADGES[badgeId].label`. Déplacer les libellés côté client casserait le push, ou imposerait de dupliquer 46 chaînes françaises. Les libellés restent donc dans `BADGES`. Seuls les **noms de catégories** et les textes des **défis** passent par i18n, parce qu'eux n'existent que côté client.

---

### Task 1: Catalogue de badges et catégories (shared)

`BadgeId` est dérivé des clés de `BADGES`. Cette tâche doit donc précéder toute modification de `BADGE_THRESHOLDS`, sinon le typecheck échoue.

**Files:**

- Modify: `shared/types.ts:113-129`
- Test: `shared/__tests__/badges-catalog.test.ts` (créer)

**Interfaces:**

- Produces: `BADGES` (46 entrées, chacune `{ id, label, icon, category }`), `type BadgeId`, `type BadgeCategory`, `BADGE_CATEGORIES: readonly BadgeCategory[]`, `interface ChallengeProgressDto`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `shared/__tests__/badges-catalog.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { BADGES, BADGE_CATEGORIES, type BadgeId } from "../types";

describe("BADGES catalog", () => {
  it("contient 46 badges", () => {
    expect(Object.keys(BADGES)).toHaveLength(46);
  });

  it("garde les 13 ids historiques intacts", () => {
    const legacy: BadgeId[] = [
      "first_trip",
      "trips_10",
      "trips_50",
      "trips_100",
      "km_100",
      "km_500",
      "km_1000",
      "co2_10kg",
      "co2_100kg",
      "co2_1t",
      "streak_7",
      "streak_30",
      "money_100",
    ];
    for (const id of legacy) {
      expect(BADGES[id]).toBeDefined();
    }
  });

  it("donne à chaque badge une catégorie connue", () => {
    for (const badge of Object.values(BADGES)) {
      expect(BADGE_CATEGORIES).toContain(badge.category);
    }
  });

  it("a un id cohérent avec sa clé", () => {
    for (const [key, badge] of Object.entries(BADGES)) {
      expect(badge.id).toBe(key);
    }
  });

  it("répartit les badges dans les 6 catégories aux bons effectifs", () => {
    const counts = BADGE_CATEGORIES.map(
      (c) => Object.values(BADGES).filter((b) => b.category === c).length,
    );
    expect(counts).toEqual([12, 13, 9, 5, 4, 3]);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd client && bunx vitest run ../shared/__tests__/badges-catalog.test.ts`
Expected: FAIL — `BADGE_CATEGORIES` n'existe pas, et `Object.keys(BADGES)` vaut 13.

- [ ] **Step 3: Écrire le catalogue**

Dans `shared/types.ts`, remplacer le bloc `BADGES` (lignes 113-129) par :

```ts
export const BADGE_CATEGORIES = [
  "volume",
  "impact",
  "regularity",
  "records",
  "habits",
  "performance",
] as const;

export type BadgeCategory = (typeof BADGE_CATEGORIES)[number];

export const BADGES = {
  // ---- 🚴 Volume (12) ----
  first_trip: { id: "first_trip", label: "Premier trajet", icon: "🚴", category: "volume" },
  trips_10: { id: "trips_10", label: "10 trajets", icon: "🔟", category: "volume" },
  trips_50: { id: "trips_50", label: "50 trajets", icon: "🏅", category: "volume" },
  trips_100: { id: "trips_100", label: "100 trajets", icon: "💯", category: "volume" },
  trips_250: { id: "trips_250", label: "250 trajets", icon: "🎖️", category: "volume" },
  trips_500: { id: "trips_500", label: "500 trajets", icon: "🏆", category: "volume" },
  km_100: { id: "km_100", label: "100 km", icon: "🛤️", category: "volume" },
  km_500: { id: "km_500", label: "500 km", icon: "🗺️", category: "volume" },
  km_1000: { id: "km_1000", label: "1 000 km", icon: "🌍", category: "volume" },
  km_2500: { id: "km_2500", label: "2 500 km", icon: "🧭", category: "volume" },
  km_5000: { id: "km_5000", label: "5 000 km", icon: "🛰️", category: "volume" },
  km_10000: { id: "km_10000", label: "10 000 km", icon: "🌐", category: "volume" },

  // ---- 🌱 Impact (13) ----
  co2_10kg: { id: "co2_10kg", label: "10 kg CO₂ économisés", icon: "🌱", category: "impact" },
  co2_100kg: { id: "co2_100kg", label: "100 kg CO₂ économisés", icon: "🌳", category: "impact" },
  co2_250kg: { id: "co2_250kg", label: "250 kg CO₂ économisés", icon: "🌿", category: "impact" },
  co2_500kg: { id: "co2_500kg", label: "500 kg CO₂ économisés", icon: "🍃", category: "impact" },
  co2_1t: { id: "co2_1t", label: "1 tonne CO₂ économisée", icon: "🌲", category: "impact" },
  fuel_25l: { id: "fuel_25l", label: "25 L économisés", icon: "⛽", category: "impact" },
  fuel_50l: { id: "fuel_50l", label: "50 L économisés", icon: "🛢️", category: "impact" },
  fuel_100l: { id: "fuel_100l", label: "100 L économisés", icon: "🚫", category: "impact" },
  fuel_250l: { id: "fuel_250l", label: "250 L économisés", icon: "🏭", category: "impact" },
  money_100: { id: "money_100", label: "100 € économisés", icon: "💰", category: "impact" },
  money_250: { id: "money_250", label: "250 € économisés", icon: "💶", category: "impact" },
  money_500: { id: "money_500", label: "500 € économisés", icon: "💸", category: "impact" },
  money_1000: { id: "money_1000", label: "1 000 € économisés", icon: "💎", category: "impact" },

  // ---- 🔥 Régularité (9) ----
  streak_3: { id: "streak_3", label: "3 jours d'affilée", icon: "🌤️", category: "regularity" },
  streak_7: { id: "streak_7", label: "7 jours de streak", icon: "🔥", category: "regularity" },
  streak_14: { id: "streak_14", label: "14 jours d'affilée", icon: "🌗", category: "regularity" },
  streak_30: { id: "streak_30", label: "30 jours de streak", icon: "⚡", category: "regularity" },
  streak_100: {
    id: "streak_100",
    label: "100 jours d'affilée",
    icon: "🌟",
    category: "regularity",
  },
  months_active_6: {
    id: "months_active_6",
    label: "6 mois actifs",
    icon: "📆",
    category: "regularity",
  },
  months_active_12: {
    id: "months_active_12",
    label: "12 mois actifs",
    icon: "🎂",
    category: "regularity",
  },
  weekly_goal_10: {
    id: "weekly_goal_10",
    label: "10 objectifs hebdo",
    icon: "🎯",
    category: "regularity",
  },
  monthly_goal_3: {
    id: "monthly_goal_3",
    label: "3 objectifs mensuels",
    icon: "🗓️",
    category: "regularity",
  },

  // ---- 🏆 Records (5) ----
  day_30: { id: "day_30", label: "30 km en un jour", icon: "☀️", category: "records" },
  day_50: { id: "day_50", label: "50 km en un jour", icon: "🌞", category: "records" },
  trip_25: { id: "trip_25", label: "Trajet de 25 km", icon: "🚀", category: "records" },
  trip_50: { id: "trip_50", label: "Trajet de 50 km", icon: "🛫", category: "records" },
  trip_2h: { id: "trip_2h", label: "2 h en selle", icon: "⏱️", category: "records" },

  // ---- 🕐 Habitudes (4) ----
  early_bird: { id: "early_bird", label: "Lève-tôt", icon: "🌅", category: "habits" },
  night_owl: { id: "night_owl", label: "Noctambule", icon: "🦉", category: "habits" },
  weekend_20: { id: "weekend_20", label: "20 trajets le week-end", icon: "🎒", category: "habits" },
  all_week: {
    id: "all_week",
    label: "Tous les jours de la semaine",
    icon: "📅",
    category: "habits",
  },

  // ---- ⚡ Performance (3) ----
  speed_20: { id: "speed_20", label: "20 km/h de moyenne", icon: "⚡", category: "performance" },
  speed_22: { id: "speed_22", label: "22 km/h de moyenne", icon: "💨", category: "performance" },
  speed_25: { id: "speed_25", label: "25 km/h de moyenne", icon: "🔥", category: "performance" },
} as const satisfies Record<
  string,
  { id: string; label: string; icon: string; category: BadgeCategory }
>;

export type BadgeId = keyof typeof BADGES;

/**
 * État d'un défi glissant. Défini ici parce que le serveur le produit
 * (derived-stats.ts) et le client le consomme (ChallengeCard.tsx).
 */
export interface ChallengeProgressDto {
  distanceKm: number;
  goalKm: number;
  tripCount: number;
  activeDays: number;
  co2Kg: number;
}
```

- [ ] **Step 4: Lancer les tests**

Run: `cd client && bunx vitest run ../shared/__tests__/badges-catalog.test.ts`
Expected: PASS (5 tests).

Puis `bun run typecheck` à la racine. Il **doit échouer** dans `server/src/lib/badges.ts` : `BADGE_THRESHOLDS` est un `Record<BadgeId, ...>` et il manque désormais 33 clés. C'est attendu — la tâche 2 le répare.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/__tests__/badges-catalog.test.ts
git commit -m "feat(badges): catalogue de 46 badges répartis en 6 catégories"
```

---

### Task 2: UserStats élargi et les 33 nouveaux prédicats

**Files:**

- Modify: `server/src/lib/badges.ts:11-33`
- Modify: `server/src/lib/__tests__/badges.test.ts:9-18`

**Interfaces:**

- Consumes: `BadgeId` (Task 1).
- Produces: `UserStats` à 16 champs, `BADGE_THRESHOLDS` à 46 entrées.

- [ ] **Step 1: Élargir le constructeur de test**

Dans `server/src/lib/__tests__/badges.test.ts`, remplacer `makeStats` :

```ts
function makeStats(overrides: Partial<UserStats> = {}): UserStats {
  return {
    totalDistanceKm: 0,
    totalCo2SavedKg: 0,
    totalMoneySavedEur: 0,
    totalFuelSavedL: 0,
    tripCount: 0,
    longestStreak: 0,
    maxTripDistanceKm: 0,
    maxTripDurationSec: 0,
    maxTripSpeedKmh: 0,
    maxDayDistanceKm: 0,
    monthsActive: 0,
    earlyTripCount: 0,
    nightTripCount: 0,
    weekendTripCount: 0,
    distinctWeekdayCount: 0,
    weeklyGoalsMet: 0,
    monthlyGoalsMet: 0,
    ...overrides,
  };
}
```

- [ ] **Step 2: Écrire les tests des nouveaux badges**

Ajouter dans le même fichier, à la suite des `describe` existants. Le pattern du repo est « seuil exact + juste en dessous » ; on le tient pour les 33.

```ts
describe("nouveaux paliers cumulatifs", () => {
  const cases: [BadgeId, keyof UserStats, number][] = [
    ["trips_250", "tripCount", 250],
    ["trips_500", "tripCount", 500],
    ["km_2500", "totalDistanceKm", 2500],
    ["km_5000", "totalDistanceKm", 5000],
    ["km_10000", "totalDistanceKm", 10000],
    ["co2_250kg", "totalCo2SavedKg", 250],
    ["co2_500kg", "totalCo2SavedKg", 500],
    ["fuel_25l", "totalFuelSavedL", 25],
    ["fuel_50l", "totalFuelSavedL", 50],
    ["fuel_100l", "totalFuelSavedL", 100],
    ["fuel_250l", "totalFuelSavedL", 250],
    ["money_250", "totalMoneySavedEur", 250],
    ["money_500", "totalMoneySavedEur", 500],
    ["money_1000", "totalMoneySavedEur", 1000],
    ["streak_3", "longestStreak", 3],
    ["streak_14", "longestStreak", 14],
    ["streak_100", "longestStreak", 100],
    ["months_active_6", "monthsActive", 6],
    ["months_active_12", "monthsActive", 12],
    ["weekly_goal_10", "weeklyGoalsMet", 10],
    ["monthly_goal_3", "monthlyGoalsMet", 3],
    ["day_30", "maxDayDistanceKm", 30],
    ["day_50", "maxDayDistanceKm", 50],
    ["trip_25", "maxTripDistanceKm", 25],
    ["trip_50", "maxTripDistanceKm", 50],
    ["trip_2h", "maxTripDurationSec", 7200],
    ["early_bird", "earlyTripCount", 10],
    ["night_owl", "nightTripCount", 10],
    ["weekend_20", "weekendTripCount", 20],
    ["all_week", "distinctWeekdayCount", 7],
    ["speed_20", "maxTripSpeedKmh", 20],
    ["speed_22", "maxTripSpeedKmh", 22],
    ["speed_25", "maxTripSpeedKmh", 25],
  ];

  for (const [badgeId, field, threshold] of cases) {
    it(`${badgeId} se débloque au seuil exact et pas juste en dessous`, () => {
      expect(BADGE_THRESHOLDS[badgeId](makeStats({ [field]: threshold }))).toBe(true);
      expect(BADGE_THRESHOLDS[badgeId](makeStats({ [field]: threshold - 1 }))).toBe(false);
    });
  }
});

describe("badges streak indexés sur longestStreak", () => {
  it("garde streak_7 quand la série actuelle est cassée mais que le record tient", () => {
    expect(BADGE_THRESHOLDS.streak_7(makeStats({ longestStreak: 12 }))).toBe(true);
  });

  it("ne débloque pas streak_30 avec un record de 29", () => {
    expect(BADGE_THRESHOLDS.streak_30(makeStats({ longestStreak: 29 }))).toBe(false);
  });
});
```

Ajouter `import type { BadgeId } from "@ecoride/shared/types";` en tête du fichier de test.

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd server && bunx vitest run src/lib/__tests__/badges.test.ts`
Expected: FAIL — les prédicats n'existent pas et `UserStats` n'a pas les champs.

- [ ] **Step 4: Écrire l'implémentation**

Dans `server/src/lib/badges.ts`, remplacer `UserStats` et `BADGE_THRESHOLDS` :

```ts
export interface UserStats {
  totalDistanceKm: number;
  totalCo2SavedKg: number;
  totalMoneySavedEur: number;
  totalFuelSavedL: number;
  tripCount: number;
  /** Plus longue série jamais réalisée. Les badges streak s'appuient dessus, pas sur la série en cours. */
  longestStreak: number;
  maxTripDistanceKm: number;
  maxTripDurationSec: number;
  /** Vitesse du meilleur trajet d'au moins 5 km. Sous ce seuil, une descente courte fausserait tout. */
  maxTripSpeedKmh: number;
  maxDayDistanceKm: number;
  monthsActive: number;
  /** Trajets démarrés avant 7 h — heure LOCALE, seule exception à la règle UTC-only du backend. */
  earlyTripCount: number;
  /** Trajets démarrés à 21 h ou après — heure LOCALE. */
  nightTripCount: number;
  weekendTripCount: number;
  /** Nombre de jours de la semaine distincts (UTC). 7 = all_week. */
  distinctWeekdayCount: number;
  weeklyGoalsMet: number;
  monthlyGoalsMet: number;
}

export const BADGE_THRESHOLDS: Record<BadgeId, (s: UserStats) => boolean> = {
  // Volume
  first_trip: (s) => s.tripCount >= 1,
  trips_10: (s) => s.tripCount >= 10,
  trips_50: (s) => s.tripCount >= 50,
  trips_100: (s) => s.tripCount >= 100,
  trips_250: (s) => s.tripCount >= 250,
  trips_500: (s) => s.tripCount >= 500,
  km_100: (s) => s.totalDistanceKm >= 100,
  km_500: (s) => s.totalDistanceKm >= 500,
  km_1000: (s) => s.totalDistanceKm >= 1000,
  km_2500: (s) => s.totalDistanceKm >= 2500,
  km_5000: (s) => s.totalDistanceKm >= 5000,
  km_10000: (s) => s.totalDistanceKm >= 10000,

  // Impact
  co2_10kg: (s) => s.totalCo2SavedKg >= 10,
  co2_100kg: (s) => s.totalCo2SavedKg >= 100,
  co2_250kg: (s) => s.totalCo2SavedKg >= 250,
  co2_500kg: (s) => s.totalCo2SavedKg >= 500,
  co2_1t: (s) => s.totalCo2SavedKg >= 1000,
  fuel_25l: (s) => s.totalFuelSavedL >= 25,
  fuel_50l: (s) => s.totalFuelSavedL >= 50,
  fuel_100l: (s) => s.totalFuelSavedL >= 100,
  fuel_250l: (s) => s.totalFuelSavedL >= 250,
  money_100: (s) => s.totalMoneySavedEur >= 100,
  money_250: (s) => s.totalMoneySavedEur >= 250,
  money_500: (s) => s.totalMoneySavedEur >= 500,
  money_1000: (s) => s.totalMoneySavedEur >= 1000,

  // Régularité — sur longestStreak, pas sur la série en cours
  streak_3: (s) => s.longestStreak >= 3,
  streak_7: (s) => s.longestStreak >= 7,
  streak_14: (s) => s.longestStreak >= 14,
  streak_30: (s) => s.longestStreak >= 30,
  streak_100: (s) => s.longestStreak >= 100,
  months_active_6: (s) => s.monthsActive >= 6,
  months_active_12: (s) => s.monthsActive >= 12,
  weekly_goal_10: (s) => s.weeklyGoalsMet >= 10,
  monthly_goal_3: (s) => s.monthlyGoalsMet >= 3,

  // Records
  day_30: (s) => s.maxDayDistanceKm >= 30,
  day_50: (s) => s.maxDayDistanceKm >= 50,
  trip_25: (s) => s.maxTripDistanceKm >= 25,
  trip_50: (s) => s.maxTripDistanceKm >= 50,
  trip_2h: (s) => s.maxTripDurationSec >= 7200,

  // Habitudes
  early_bird: (s) => s.earlyTripCount >= 10,
  night_owl: (s) => s.nightTripCount >= 10,
  weekend_20: (s) => s.weekendTripCount >= 20,
  all_week: (s) => s.distinctWeekdayCount >= 7,

  // Performance
  speed_20: (s) => s.maxTripSpeedKmh >= 20,
  speed_22: (s) => s.maxTripSpeedKmh >= 22,
  speed_25: (s) => s.maxTripSpeedKmh >= 25,
};
```

`currentStreak` disparaît de `UserStats` : plus aucun badge ne s'en sert. Les deux appels `currentStreak: streaks.current` dans `evaluateAndUnlockBadges` et `reevaluateBadges` seront corrigés en tâche 4 — d'ici là le typecheck reste rouge sur ces deux lignes, c'est attendu.

- [ ] **Step 5: Lancer les tests**

Run: `cd server && bunx vitest run src/lib/__tests__/badges.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/badges.ts server/src/lib/__tests__/badges.test.ts
git commit -m "feat(badges): 33 nouveaux prédicats et bascule des streaks sur longest"
```

---

### Task 3: computeDerivedStats — fonction pure

Toute la logique risquée (frontières de semaine, changement d'heure, mois civils) vit ici, sans base de données, sans horloge implicite. Même pattern que `computeStreakFromDates`.

**Files:**

- Create: `server/src/lib/derived-stats.ts`
- Test: `server/src/lib/__tests__/derived-stats.test.ts`

**Interfaces:**

- Consumes: `ChallengeProgressDto` (Task 1).
- Produces:

  ```ts
  export const WEEKLY_GOAL_KM = 50;
  export const MONTHLY_GOAL_KM = 250;
  export interface DailyRow {
    day: string;
    distanceKm: number;
    co2Kg: number;
    tripCount: number;
  }
  export interface DerivedStats {
    maxDayDistanceKm: number;
    monthsActive: number;
    weeklyGoalsMet: number;
    monthlyGoalsMet: number;
    currentWeek: ChallengeProgressDto;
    currentMonth: ChallengeProgressDto;
  }
  export function computeDerivedStats(rows: DailyRow[], today: string): DerivedStats;
  ```

  `day` et `today` sont au format `YYYY-MM-DD`, en UTC.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `server/src/lib/__tests__/derived-stats.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { computeDerivedStats, WEEKLY_GOAL_KM, type DailyRow } from "../derived-stats";

function row(day: string, distanceKm: number, tripCount = 1): DailyRow {
  return { day, distanceKm, co2Kg: distanceKm * 0.1617, tripCount };
}

describe("computeDerivedStats", () => {
  it("renvoie des compteurs à zéro sur un historique vide", () => {
    const d = computeDerivedStats([], "2026-07-28");
    expect(d.maxDayDistanceKm).toBe(0);
    expect(d.monthsActive).toBe(0);
    expect(d.weeklyGoalsMet).toBe(0);
    expect(d.monthlyGoalsMet).toBe(0);
    expect(d.currentWeek.distanceKm).toBe(0);
    expect(d.currentWeek.goalKm).toBe(WEEKLY_GOAL_KM);
  });

  it("retient la meilleure journée", () => {
    const d = computeDerivedStats([row("2026-07-01", 12), row("2026-07-02", 41)], "2026-07-28");
    expect(d.maxDayDistanceKm).toBe(41);
  });

  it("compte les mois civils distincts", () => {
    const d = computeDerivedStats(
      [row("2026-05-30", 10), row("2026-06-01", 10), row("2026-06-20", 10)],
      "2026-07-28",
    );
    expect(d.monthsActive).toBe(2);
  });

  it("fait démarrer la semaine le lundi", () => {
    // 2026-07-26 est un dimanche, 2026-07-27 le lundi suivant.
    const d = computeDerivedStats([row("2026-07-26", 30), row("2026-07-27", 20)], "2026-07-28");
    // Seul le lundi et après comptent dans la semaine en cours.
    expect(d.currentWeek.distanceKm).toBe(20);
  });

  it("compte une semaine réussie quand le cumul lundi-dimanche atteint l'objectif", () => {
    const d = computeDerivedStats(
      [row("2026-07-06", 25), row("2026-07-08", 25), row("2026-07-13", 10)],
      "2026-07-28",
    );
    expect(d.weeklyGoalsMet).toBe(1);
  });

  it("compte les mois réussis à 250 km", () => {
    const d = computeDerivedStats(
      [row("2026-05-02", 150), row("2026-05-20", 100), row("2026-06-02", 40)],
      "2026-07-28",
    );
    expect(d.monthlyGoalsMet).toBe(1);
  });

  it("agrège trajets, jours actifs et CO₂ du mois en cours", () => {
    const d = computeDerivedStats(
      [row("2026-07-02", 20, 3), row("2026-07-15", 30, 2), row("2026-06-30", 99, 9)],
      "2026-07-28",
    );
    expect(d.currentMonth.distanceKm).toBe(50);
    expect(d.currentMonth.tripCount).toBe(5);
    expect(d.currentMonth.activeDays).toBe(2);
    expect(d.currentMonth.co2Kg).toBeCloseTo(50 * 0.1617, 3);
  });

  it("n'est pas perturbé par le passage à l'heure d'hiver", () => {
    // 2026-10-25 est le dimanche du changement d'heure en Europe.
    // Les jours arrivent en UTC : la semaine doit rester à 7 jours.
    const d = computeDerivedStats(
      [row("2026-10-19", 10), row("2026-10-25", 10), row("2026-10-26", 10)],
      "2026-10-26",
    );
    expect(d.currentWeek.distanceKm).toBe(10);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd server && bunx vitest run src/lib/__tests__/derived-stats.test.ts`
Expected: FAIL — `Cannot find module '../derived-stats'`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `server/src/lib/derived-stats.ts` :

```ts
/**
 * Repli des sommes journalières en records, mois actifs, objectifs atteints
 * et état des deux défis en cours.
 *
 * Fonction pure : aucun accès base, aucune lecture d'horloge. `today` est
 * injecté pour que les tests soient déterministes. Toutes les dates sont des
 * jours UTC au format YYYY-MM-DD, cohérent avec computeStreak().
 */

import type { ChallengeProgressDto } from "@ecoride/shared/types";

export const WEEKLY_GOAL_KM = 50;
export const MONTHLY_GOAL_KM = 250;

export interface DailyRow {
  day: string; // YYYY-MM-DD, UTC
  distanceKm: number;
  co2Kg: number;
  tripCount: number;
}

export interface DerivedStats {
  maxDayDistanceKm: number;
  monthsActive: number;
  weeklyGoalsMet: number;
  monthlyGoalsMet: number;
  currentWeek: ChallengeProgressDto;
  currentMonth: ChallengeProgressDto;
}

interface Bucket {
  distanceKm: number;
  co2Kg: number;
  tripCount: number;
  activeDays: number;
}

function emptyBucket(): Bucket {
  return { distanceKm: 0, co2Kg: 0, tripCount: 0, activeDays: 0 };
}

/** Lundi de la semaine ISO contenant `day`, au format YYYY-MM-DD. */
export function isoWeekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  // getUTCDay(): 0 = dimanche. On ramène dimanche à 7 pour que lundi = 1.
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

function monthKey(day: string): string {
  return day.slice(0, 7); // YYYY-MM
}

function fold(rows: DailyRow[], keyOf: (day: string) => string): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const key = keyOf(r.day);
    const b = buckets.get(key) ?? emptyBucket();
    b.distanceKm += r.distanceKm;
    b.co2Kg += r.co2Kg;
    b.tripCount += r.tripCount;
    b.activeDays += 1;
    buckets.set(key, b);
  }
  return buckets;
}

function toProgress(b: Bucket | undefined, goalKm: number): ChallengeProgressDto {
  const bucket = b ?? emptyBucket();
  return {
    distanceKm: bucket.distanceKm,
    goalKm,
    tripCount: bucket.tripCount,
    activeDays: bucket.activeDays,
    co2Kg: bucket.co2Kg,
  };
}

export function computeDerivedStats(rows: DailyRow[], today: string): DerivedStats {
  const weeks = fold(rows, isoWeekStart);
  const months = fold(rows, monthKey);

  let maxDayDistanceKm = 0;
  for (const r of rows) {
    if (r.distanceKm > maxDayDistanceKm) maxDayDistanceKm = r.distanceKm;
  }

  let weeklyGoalsMet = 0;
  for (const b of weeks.values()) {
    if (b.distanceKm >= WEEKLY_GOAL_KM) weeklyGoalsMet += 1;
  }

  let monthlyGoalsMet = 0;
  for (const b of months.values()) {
    if (b.distanceKm >= MONTHLY_GOAL_KM) monthlyGoalsMet += 1;
  }

  return {
    maxDayDistanceKm,
    monthsActive: months.size,
    weeklyGoalsMet,
    monthlyGoalsMet,
    currentWeek: toProgress(weeks.get(isoWeekStart(today)), WEEKLY_GOAL_KM),
    currentMonth: toProgress(months.get(monthKey(today)), MONTHLY_GOAL_KM),
  };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `cd server && bunx vitest run src/lib/__tests__/derived-stats.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/derived-stats.ts server/src/lib/__tests__/derived-stats.test.ts
git commit -m "feat(badges): fonction pure de repli des stats journalières"
```

---

### Task 4: Brancher les agrégats sur les deux fonctions d'évaluation

**Files:**

- Modify: `server/src/lib/badges.ts` (les deux fonctions et leurs requêtes)

**Interfaces:**

- Consumes: `computeDerivedStats`, `DailyRow` (Task 3); `UserStats` (Task 2).
- Produces: `collectUserStats(userId: string): Promise<UserStats>` — exportée, réutilisée par la route stats en tâche 5.

- [ ] **Step 1: Écrire le test de non-régression sur la révocation**

Ajouter dans `server/src/lib/__tests__/badges.test.ts` :

```ts
describe("révocation", () => {
  it("retire un badge de palier dont le seuil n'est plus atteint", () => {
    expect(BADGE_THRESHOLDS.km_2500(makeStats({ totalDistanceKm: 2499 }))).toBe(false);
  });

  it("ne retire pas un badge streak quand la série en cours est nulle mais le record tient", () => {
    // Régression : avant, les badges streak lisaient currentStreak et
    // disparaissaient à la première suppression de trajet.
    expect(BADGE_THRESHOLDS.streak_30(makeStats({ longestStreak: 31 }))).toBe(true);
  });

  it("ignore un trajet court et rapide pour les badges de vitesse", () => {
    // maxTripSpeedKmh n'est alimenté que par les trajets >= 5 km,
    // donc une descente de 500 m à 40 km/h laisse le champ à 0.
    expect(BADGE_THRESHOLDS.speed_25(makeStats({ maxTripSpeedKmh: 0 }))).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer les tests**

Run: `cd server && bunx vitest run src/lib/__tests__/badges.test.ts`
Expected: PASS — ces trois assertions passent déjà grâce à la tâche 2. Elles verrouillent le comportement avant qu'on touche aux requêtes.

- [ ] **Step 3: Extraire la collecte des stats**

Dans `server/src/lib/badges.ts`, remplacer les deux blocs d'agrégation dupliqués (ils sont aujourd'hui copiés à l'identique dans `evaluateAndUnlockBadges` et `reevaluateBadges`) par une fonction unique.

Ajouter les imports :

```ts
import { eq, and, sum, count, max, sql, inArray } from "drizzle-orm";
import { user } from "../db/schema";
import { computeDerivedStats, type DailyRow } from "./derived-stats";
import { normalizeTimezone } from "./timezone";
```

Puis :

```ts
/**
 * Agrège toutes les métriques dont dépendent les badges.
 *
 * Trois requêtes :
 *   A — agrégat une-ligne (sommes, maxima, compteurs d'habitudes)
 *   B — sommes par jour UTC, repliées en TypeScript par computeDerivedStats
 *   C — computeStreak, dont on ne garde que `longest`
 */
export async function collectUserStats(userId: string): Promise<UserStats> {
  const [profile] = await db
    .select({ timezone: user.timezone })
    .from(user)
    .where(eq(user.id, userId));

  // Seule exception à la règle UTC-only du backend : l'heure de la journée est
  // intrinsèquement locale, sinon "avant 7 h" devient "avant 9 h" à Paris en été.
  const tz = normalizeTimezone(profile?.timezone);
  const localHour = sql<number>`EXTRACT(hour FROM ${trips.startedAt} AT TIME ZONE ${tz})`;
  const utcDow = sql<number>`EXTRACT(dow FROM ${trips.startedAt} AT TIME ZONE 'UTC')`;

  const [agg] = await db
    .select({
      totalDistanceKm: sum(trips.distanceKm).mapWith(Number),
      totalCo2SavedKg: sum(trips.co2SavedKg).mapWith(Number),
      totalMoneySavedEur: sum(trips.moneySavedEur).mapWith(Number),
      totalFuelSavedL: sum(trips.fuelSavedL).mapWith(Number),
      tripCount: count(),
      maxTripDistanceKm: max(trips.distanceKm).mapWith(Number),
      maxTripDurationSec: max(trips.durationSec).mapWith(Number),
      maxTripSpeedKmh: sql<number>`coalesce(max(
        case when ${trips.distanceKm} >= 5 and ${trips.durationSec} > 0
        then ${trips.distanceKm} / (${trips.durationSec} / 3600.0)
        end
      ), 0)`.mapWith(Number),
      earlyTripCount: sql<number>`count(*) filter (where ${localHour} < 7)`.mapWith(Number),
      nightTripCount: sql<number>`count(*) filter (where ${localHour} >= 21)`.mapWith(Number),
      weekendTripCount: sql<number>`count(*) filter (where ${utcDow} in (0, 6))`.mapWith(Number),
      distinctWeekdayCount: sql<number>`count(distinct ${utcDow})`.mapWith(Number),
    })
    .from(trips)
    .where(eq(trips.userId, userId));

  const dayExpr = sql<string>`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`;
  const dailyRows: DailyRow[] = await db
    .select({
      day: dayExpr.as("day"),
      distanceKm: sum(trips.distanceKm).mapWith(Number),
      co2Kg: sum(trips.co2SavedKg).mapWith(Number),
      tripCount: count(),
    })
    .from(trips)
    .where(eq(trips.userId, userId))
    .groupBy(dayExpr);

  const derived = computeDerivedStats(dailyRows, new Date().toISOString().slice(0, 10));
  const streaks = await computeStreak(userId);

  return {
    totalDistanceKm: agg?.totalDistanceKm ?? 0,
    totalCo2SavedKg: agg?.totalCo2SavedKg ?? 0,
    totalMoneySavedEur: agg?.totalMoneySavedEur ?? 0,
    totalFuelSavedL: agg?.totalFuelSavedL ?? 0,
    tripCount: agg?.tripCount ?? 0,
    longestStreak: streaks.longest,
    maxTripDistanceKm: agg?.maxTripDistanceKm ?? 0,
    maxTripDurationSec: agg?.maxTripDurationSec ?? 0,
    maxTripSpeedKmh: agg?.maxTripSpeedKmh ?? 0,
    maxDayDistanceKm: derived.maxDayDistanceKm,
    monthsActive: derived.monthsActive,
    earlyTripCount: agg?.earlyTripCount ?? 0,
    nightTripCount: agg?.nightTripCount ?? 0,
    weekendTripCount: agg?.weekendTripCount ?? 0,
    distinctWeekdayCount: agg?.distinctWeekdayCount ?? 0,
    weeklyGoalsMet: derived.weeklyGoalsMet,
    monthlyGoalsMet: derived.monthlyGoalsMet,
  };
}
```

Puis remplacer, **dans les deux fonctions**, tout le bloc « 1. Aggregate lifetime stats » (de `const [stats] = await db` jusqu'à la fermeture de l'objet `userStats`) par :

```ts
const userStats = await collectUserStats(userId);
```

- [ ] **Step 4: Vérifier**

Run: `cd server && bunx vitest run && bun run typecheck`
Expected: PASS, plus aucune erreur de typecheck (les `currentStreak: streaks.current` ont disparu avec le bloc dupliqué).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/badges.ts
git commit -m "feat(badges): collecte unifiée des agrégats pour les 46 badges"
```

---

### Task 5: Exposer les défis dans /api/stats

**Files:**

- Modify: `server/src/routes/stats.routes.ts:62-80`
- Test: `server/src/routes/__tests__/stats.test.ts`

**Interfaces:**

- Consumes: `computeDerivedStats` (Task 3), `ChallengeProgressDto` (Task 1).
- Produces: la réponse `/api/stats` gagne `challenges: { week: ChallengeProgressDto; month: ChallengeProgressDto }`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `server/src/routes/__tests__/stats.test.ts`, en suivant le harnais de mock déjà présent dans le fichier :

```ts
it("expose la progression des défis hebdo et mensuel", async () => {
  const res = await app.request("/stats");
  const body = (await res.json()) as {
    data: { challenges: { week: { goalKm: number }; month: { goalKm: number } } };
  };
  expect(body.data.challenges.week.goalKm).toBe(50);
  expect(body.data.challenges.month.goalKm).toBe(250);
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd server && bunx vitest run src/routes/__tests__/stats.test.ts`
Expected: FAIL — `challenges` est `undefined`.

- [ ] **Step 3: Implémenter**

Dans `server/src/routes/stats.routes.ts`, à la suite du calcul existant de `stats` et `streaks`, ajouter la requête journalière et le repli, puis inclure le bloc dans la réponse :

```ts
const dayExpr = sql<string>`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`;
const dailyRows = await db
  .select({
    day: dayExpr.as("day"),
    distanceKm: sum(trips.distanceKm).mapWith(Number),
    co2Kg: sum(trips.co2SavedKg).mapWith(Number),
    tripCount: count(),
  })
  .from(trips)
  .where(eq(trips.userId, currentUser.id))
  .groupBy(dayExpr);

const derived = computeDerivedStats(dailyRows, new Date().toISOString().slice(0, 10));
```

et dans le `c.json({ ok: true, data: { ... } })` :

```ts
      challenges: { week: derived.currentWeek, month: derived.currentMonth },
```

- [ ] **Step 4: Lancer les tests**

Run: `cd server && bunx vitest run src/routes/__tests__/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/stats.routes.ts server/src/routes/__tests__/stats.test.ts
git commit -m "feat(badges): expose la progression des défis dans /api/stats"
```

---

### Task 6: BadgeGrid — grille unique groupée par catégorie

`ProfileBadgesSection` et `StatsBadgesSection` contiennent aujourd'hui la même grille, copiée au caractère près. Cette tâche supprime la duplication en même temps qu'elle ajoute le regroupement.

**Files:**

- Create: `client/src/components/badges/BadgeGrid.tsx`
- Modify: `client/src/components/profile/ProfileBadgesSection.tsx`
- Modify: `client/src/components/stats/StatsBadgesSection.tsx`
- Modify: `client/src/i18n/locales/fr.ts`, `client/src/i18n/locales/en.ts`
- Test: `client/src/components/badges/__tests__/BadgeGrid.test.tsx`

**Interfaces:**

- Consumes: `BADGES`, `BADGE_CATEGORIES`, `BadgeCategory` (Task 1).
- Produces: `<BadgeGrid achievements={Achievement[]} />`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `client/src/components/badges/__tests__/BadgeGrid.test.tsx` :

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BadgeGrid } from "../BadgeGrid";
import { I18nProvider } from "@/i18n/provider";

function renderGrid(achievements: { badgeId: string }[] = []) {
  return render(
    <I18nProvider>
      <BadgeGrid achievements={achievements as never} />
    </I18nProvider>,
  );
}

describe("BadgeGrid", () => {
  it("affiche les 6 catégories", () => {
    renderGrid();
    for (const label of ["Volume", "Impact", "Régularité", "Records", "Habitudes", "Performance"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("affiche le compteur de débloqués par catégorie", () => {
    renderGrid([{ badgeId: "first_trip" }, { badgeId: "trips_10" }]);
    expect(screen.getByText("2/12")).toBeInTheDocument();
  });

  it("affiche les 46 badges", () => {
    renderGrid();
    expect(screen.getAllByRole("listitem")).toHaveLength(46);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd client && bunx vitest run src/components/badges/__tests__/BadgeGrid.test.tsx`
Expected: FAIL — `Cannot find module '../BadgeGrid'`.

- [ ] **Step 3: Écrire le composant**

Créer `client/src/components/badges/BadgeGrid.tsx` :

```tsx
import { BADGES, BADGE_CATEGORIES, type BadgeCategory, type BadgeId } from "@ecoride/shared/types";
import type { Achievement } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

const badgesByCategory = BADGE_CATEGORIES.map((category) => ({
  category,
  ids: (Object.keys(BADGES) as BadgeId[]).filter((id) => BADGES[id].category === category),
}));

interface BadgeGridProps {
  achievements: Achievement[];
}

export function BadgeGrid({ achievements }: BadgeGridProps) {
  const t = useT();
  const unlocked = new Set(achievements.map((a) => a.badgeId));

  return (
    <div className="space-y-6">
      {badgesByCategory.map(({ category, ids }) => {
        const count = ids.filter((id) => unlocked.has(id)).length;

        return (
          <section key={category} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                {t(`badges.category.${category}` as Parameters<typeof t>[0])}
              </h3>
              <span className="text-xs font-bold text-text-dim">
                {count}/{ids.length}
              </span>
            </div>
            <ul className="grid grid-cols-4 gap-4">
              {ids.map((id) => {
                const badge = BADGES[id];
                const isUnlocked = unlocked.has(id);

                return (
                  <li
                    key={id}
                    className={`flex flex-col items-center gap-2 ${!isUnlocked ? "opacity-40" : ""}`}
                  >
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                        isUnlocked
                          ? "bg-primary/10 text-primary-light"
                          : "bg-surface-high text-text-dim"
                      }`}
                    >
                      <span className="text-2xl">{badge.icon}</span>
                    </div>
                    <span className="text-center text-xs font-bold uppercase leading-tight text-text-muted">
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

Ajouter dans `client/src/i18n/locales/fr.ts` :

```ts
  "badges.category.volume": "Volume",
  "badges.category.impact": "Impact",
  "badges.category.regularity": "Régularité",
  "badges.category.records": "Records",
  "badges.category.habits": "Habitudes",
  "badges.category.performance": "Performance",
```

et dans `en.ts` :

```ts
  "badges.category.volume": "Volume",
  "badges.category.impact": "Impact",
  "badges.category.regularity": "Consistency",
  "badges.category.records": "Records",
  "badges.category.habits": "Habits",
  "badges.category.performance": "Performance",
```

- [ ] **Step 4: Remplacer les deux sections dupliquées**

`client/src/components/profile/ProfileBadgesSection.tsx` devient :

```tsx
import type { Achievement } from "@ecoride/shared/types";
import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { useT } from "@/i18n/provider";

interface ProfileBadgesSectionProps {
  achievements: Achievement[];
}

export function ProfileBadgesSection({ achievements }: ProfileBadgesSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">{t("profile.badges.title")}</h2>
      <BadgeGrid achievements={achievements} />
    </section>
  );
}
```

`client/src/components/stats/StatsBadgesSection.tsx` devient :

```tsx
import type { Achievement } from "@ecoride/shared/types";
import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { useT } from "@/i18n/provider";

type StatsBadgesSectionProps = {
  achievements: Achievement[];
};

export function StatsBadgesSection({ achievements }: StatsBadgesSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
        {t("stats.badges.title")}
      </h3>
      <BadgeGrid achievements={achievements} />
    </section>
  );
}
```

- [ ] **Step 5: Lancer les tests**

Run: `cd client && bunx vitest run src/components/badges/`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/badges client/src/components/profile/ProfileBadgesSection.tsx client/src/components/stats/StatsBadgesSection.tsx client/src/i18n/locales
git commit -m "feat(badges): grille unique groupée par catégorie"
```

---

### Task 7: ChallengeCard

**Files:**

- Create: `client/src/components/badges/ChallengeCard.tsx`
- Modify: `client/src/components/stats/StatsBadgesSection.tsx`
- Modify: `client/src/pages/DashboardPage.tsx`
- Modify: `client/src/i18n/locales/fr.ts`, `en.ts`
- Test: `client/src/components/badges/__tests__/ChallengeCard.test.tsx`

**Interfaces:**

- Consumes: `ChallengeProgressDto` (Task 5).
- Produces: `<ChallengeCard period="week" | "month" progress={ChallengeProgressDto} compact?: boolean />`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `client/src/components/badges/__tests__/ChallengeCard.test.tsx` :

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChallengeCard } from "../ChallengeCard";
import { I18nProvider } from "@/i18n/provider";

const progress = { distanceKm: 32, goalKm: 50, tripCount: 6, activeDays: 3, co2Kg: 7.4 };

describe("ChallengeCard", () => {
  it("affiche la distance et l'objectif", () => {
    render(
      <I18nProvider>
        <ChallengeCard period="week" progress={progress} />
      </I18nProvider>,
    );
    expect(screen.getByText(/32/)).toBeInTheDocument();
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });

  it("borne la barre de progression à 100 % au-delà de l'objectif", () => {
    render(
      <I18nProvider>
        <ChallengeCard period="week" progress={{ ...progress, distanceKm: 80 }} />
      </I18nProvider>,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("masque les compteurs secondaires en mode compact", () => {
    render(
      <I18nProvider>
        <ChallengeCard period="week" progress={progress} compact />
      </I18nProvider>,
    );
    expect(screen.queryByText(/7,4/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd client && bunx vitest run src/components/badges/__tests__/ChallengeCard.test.tsx`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire le composant**

Créer `client/src/components/badges/ChallengeCard.tsx` :

```tsx
import type { ChallengeProgressDto } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

interface ChallengeCardProps {
  period: "week" | "month";
  progress: ChallengeProgressDto;
  compact?: boolean;
}

export function ChallengeCard({ period, progress, compact = false }: ChallengeCardProps) {
  const t = useT();
  const pct = Math.min(100, Math.round((progress.distanceKm / progress.goalKm) * 100));

  return (
    <section className="space-y-2 rounded-2xl bg-surface-high p-4">
      <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
        {t(`badges.challenge.${period}` as Parameters<typeof t>[0])}
      </h3>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      <p className="text-sm font-bold">
        {Math.round(progress.distanceKm)} / {progress.goalKm} km
      </p>

      {!compact && (
        <p className="text-xs text-text-muted">
          {progress.tripCount} · {progress.activeDays} · {progress.co2Kg.toFixed(1)} kg CO₂
        </p>
      )}
    </section>
  );
}
```

Ajouter dans `fr.ts` :

```ts
  "badges.challenge.week": "Défi de la semaine",
  "badges.challenge.month": "Défi du mois",
```

et dans `en.ts` :

```ts
  "badges.challenge.week": "Weekly challenge",
  "badges.challenge.month": "Monthly challenge",
```

- [ ] **Step 4: Brancher les deux emplacements**

`StatsBadgesSection` gagne une prop `challenges` optionnelle et rend les deux cartes
détaillées au-dessus de la grille :

```tsx
import type { Achievement, ChallengeProgressDto } from "@ecoride/shared/types";
import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { ChallengeCard } from "@/components/badges/ChallengeCard";
import { useT } from "@/i18n/provider";

type StatsBadgesSectionProps = {
  achievements: Achievement[];
  challenges?: { week: ChallengeProgressDto; month: ChallengeProgressDto };
};

export function StatsBadgesSection({ achievements, challenges }: StatsBadgesSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      {challenges && (
        <div className="space-y-3">
          <ChallengeCard period="week" progress={challenges.week} />
          <ChallengeCard period="month" progress={challenges.month} />
        </div>
      )}
      <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
        {t("stats.badges.title")}
      </h3>
      <BadgeGrid achievements={achievements} />
    </section>
  );
}
```

Le parent (`StatsPage`) passe `challenges={stats.challenges}` depuis la réponse
`/api/stats` qu'il charge déjà. La prop est optionnelle pour que la page reste
affichable pendant le chargement.

Dans `DashboardPage`, insérer la version compacte au-dessus des sections existantes,
en la conditionnant à la présence des données :

```tsx
{
  stats?.challenges && <ChallengeCard period="week" progress={stats.challenges.week} compact />;
}
```

⚠️ Ouvrir `client/src/pages/StatsPage.tsx` et `DashboardPage.tsx` avant d'éditer : le nom
exact du hook de chargement des stats et la forme de son retour varient selon la page.
Reprendre l'existant, ne pas inventer de nouveau fetch.

- [ ] **Step 5: Lancer les tests**

Run: `cd client && bunx vitest run src/components/badges/ && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/badges client/src/components/stats client/src/pages/DashboardPage.tsx client/src/i18n/locales
git commit -m "feat(badges): carte de défi hebdo et mensuel"
```

---

### Task 8: e2e Playwright

**Files:**

- Create: `client/e2e/badges-categories.spec.ts`

**Interfaces:**

- Consumes: tout ce qui précède.

- [ ] **Step 1: Écrire le test**

Le repo n'a **pas** de helper de stub : chaque spec appelle `page.route("**/api/**", ...)`
en ligne et discrimine sur l'URL. Ouvrir `client/e2e/stats-period.spec.ts` et reprendre son
préambule tel quel — désinscription du service worker, stub de `registerSW.js`, stub de
`/api/auth/` — sans quoi la page redirige vers `/login` et le test échoue sans rapport avec
les badges.

```ts
import { test, expect } from "@playwright/test";

const CHALLENGES = {
  week: { distanceKm: 32, goalKm: 50, tripCount: 6, activeDays: 3, co2Kg: 7.4 },
  month: { distanceKm: 178, goalKm: 250, tripCount: 24, activeDays: 14, co2Kg: 41 },
};

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test.describe("Badges par catégorie", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    });

    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    await page.route("**/api/**", (route) => {
      const url = route.request().url();

      if (url.includes("/api/auth/")) {
        return route.fulfill(
          json({ session: { id: "s", userId: "u" }, user: { id: "u", name: "Test" } }),
        );
      }

      if (url.includes("/api/stats")) {
        return route.fulfill(
          json({
            ok: true,
            data: {
              totalDistanceKm: 1159.8,
              totalCo2SavedKg: 187.5,
              achievements: [{ badgeId: "first_trip" }, { badgeId: "km_1000" }],
              challenges: CHALLENGES,
            },
          }),
        );
      }

      return route.fulfill(json({ ok: true, data: {} }));
    });
  });

  test("affiche les 6 catégories", async ({ page }) => {
    await page.goto("/stats");

    for (const label of ["Volume", "Impact", "Régularité", "Records", "Habitudes", "Performance"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("affiche la barre de progression du défi hebdo", async ({ page }) => {
    await page.goto("/stats");

    // 32 / 50 = 64 %
    await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "64");
  });
});
```

⚠️ Le stub de `/api/auth/` ci-dessus est réduit au minimum. Si la page redirige quand même
vers `/login`, copier la réponse d'authentification complète depuis `stats-period.spec.ts`,
qui contient tous les champs attendus par le client.

- [ ] **Step 2: Lancer**

Run: `cd client && bunx playwright test e2e/badges-categories.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Vérification complète**

```bash
bun run typecheck && bun run lint && bun run format:check
cd server && bun run test:coverage
cd ../client && bunx vitest run
```

Expected: tout vert.

- [ ] **Step 4: Commit et PR**

```bash
git add client/e2e/badges-categories.spec.ts
git commit -m "feat(badges): e2e sur les catégories et la carte de défi"
git push -u origin feat/badges-categories
gh pr create --title "feat(badges): 46 badges en 6 catégories et défis glissants" --body "Implémente docs/superpowers/specs/2026-07-28-badges-categories-design.md"
```

---

## Points ouverts hérités de la spec

À trancher avant merge, ils ne bloquent aucune tâche :

1. **`trips_250` / `trips_500`** — nombre de trajets réel inconnu, paliers posés au jugé.
2. **`streak_14` / `streak_100`** — plus longue série inconnue. 100 jours est peut-être hors d'atteinte, 60 serait un repli.
3. **Import historique** — si des trajets antérieurs à mars 2026 existent, toute la calibration des paliers est trop optimiste.
4. **Libellés i18n** — reportés (voir « Décision de périmètre » plus haut). À reprendre si le texte des notifications push est un jour localisé.
