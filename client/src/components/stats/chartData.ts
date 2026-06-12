import type { Trip } from "@ecoride/shared/types";
import type { TranslateFn } from "@/i18n/provider";

export type Period = "week" | "month" | "year";
export type Metric = "km" | "co2" | "eur";

export type StatsChartDatum = {
  label: string;
  km: number;
  co2: number;
  eur: number;
};

type ChartTrip = Pick<Trip, "startedAt" | "distanceKm" | "co2SavedKg" | "moneySavedEur">;

export const getPeriodLabels = (t: TranslateFn): Record<Period, string> => ({
  week: t("stats.chart.period.week"),
  month: t("stats.chart.period.month"),
  year: t("stats.chart.period.year"),
});

export const getMetricLabels = (t: TranslateFn): Record<Metric, string> => ({
  km: t("stats.chart.metric.km"),
  co2: t("stats.chart.metric.co2"),
  eur: t("stats.chart.metric.eur"),
});

export const getDayLabels = (t: TranslateFn): string[] => [
  t("stats.days.mon"),
  t("stats.days.tue"),
  t("stats.days.wed"),
  t("stats.days.thu"),
  t("stats.days.fri"),
  t("stats.days.sat"),
  t("stats.days.sun"),
];

export const getMonthLabels = (t: TranslateFn): string[] => [
  t("stats.months.jan"),
  t("stats.months.feb"),
  t("stats.months.mar"),
  t("stats.months.apr"),
  t("stats.months.may"),
  t("stats.months.jun"),
  t("stats.months.jul"),
  t("stats.months.aug"),
  t("stats.months.sep"),
  t("stats.months.oct"),
  t("stats.months.nov"),
  t("stats.months.dec"),
];

export function buildChartData(
  chartTrips: ChartTrip[],
  period: Period,
  dayLabels: string[],
  monthLabels: string[],
) {
  let data: StatsChartDatum[];

  if (period === "week") {
    data = dayLabels.map((label) => ({ label, km: 0, co2: 0, eur: 0 }));
    for (const trip of chartTrips) {
      const dayIndex = (new Date(trip.startedAt).getDay() + 6) % 7;
      if (data[dayIndex]) {
        data[dayIndex].km += trip.distanceKm;
        data[dayIndex].co2 += trip.co2SavedKg;
        data[dayIndex].eur += trip.moneySavedEur;
      }
    }
  } else if (period === "month") {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    data = Array.from({ length: daysInMonth }, (_, index) => ({
      label: String(index + 1),
      km: 0,
      co2: 0,
      eur: 0,
    }));
    for (const trip of chartTrips) {
      const dayOfMonth = new Date(trip.startedAt).getDate() - 1;
      if (data[dayOfMonth]) {
        data[dayOfMonth].km += trip.distanceKm;
        data[dayOfMonth].co2 += trip.co2SavedKg;
        data[dayOfMonth].eur += trip.moneySavedEur;
      }
    }
  } else {
    data = monthLabels.map((label) => ({ label, km: 0, co2: 0, eur: 0 }));
    for (const trip of chartTrips) {
      const monthIndex = new Date(trip.startedAt).getMonth();
      if (data[monthIndex]) {
        data[monthIndex].km += trip.distanceKm;
        data[monthIndex].co2 += trip.co2SavedKg;
        data[monthIndex].eur += trip.moneySavedEur;
      }
    }
  }

  for (const datum of data) {
    datum.km = Math.round(datum.km * 10) / 10;
    datum.co2 = Math.round(datum.co2 * 10) / 10;
    datum.eur = Math.round(datum.eur * 100) / 100;
  }

  return data;
}
