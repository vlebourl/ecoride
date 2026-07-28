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
