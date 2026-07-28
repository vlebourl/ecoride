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
