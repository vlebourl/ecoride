/**
 * Source unique des sommes par jour UTC.
 *
 * Deux consommateurs s'appuient dessus et DOIVENT voir exactement les mêmes
 * lignes : `collectUserStats` (badges, dont `weekly_goal_*` et `day_*`) et
 * `GET /api/stats/summary` (carte de défi hebdo/mensuel). Tant que les deux
 * partageaient une copie textuelle de la requête, rien n'empêchait qu'une
 * modification de l'une — par exemple regrouper en fuseau local — laisse
 * l'autre inchangée : le badge et la carte se contrediraient alors sur la
 * même semaine, sans qu'aucun test ne bronche.
 *
 * La définition du « jour » ici (`DATE(startedAt AT TIME ZONE 'UTC')`) est
 * aussi celle de `computeStreak` (streaks.ts) — voir le commentaire là-bas.
 *
 * `startedAt` est un `timestamptz` : `AT TIME ZONE 'UTC'` produit un timestamp
 * nu, donc le découpage en jours ne dépend pas du `TimeZone` de session
 * PostgreSQL.
 */

import { eq, sum, count, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "../db/schema";
import type { DailyRow } from "./derived-stats";

export async function fetchDailyRows(userId: string): Promise<DailyRow[]> {
  const dayExpr = sql<string>`DATE(${trips.startedAt} AT TIME ZONE 'UTC')`;
  return db
    .select({
      day: dayExpr.as("day"),
      distanceKm: sum(trips.distanceKm).mapWith(Number),
      co2Kg: sum(trips.co2SavedKg).mapWith(Number),
      tripCount: count(),
    })
    .from(trips)
    .where(eq(trips.userId, userId))
    .groupBy(dayExpr);
}
