import type { StatsPeriod } from "@ecoride/shared/api-contracts";

/** UTC period boundaries shared by personal, community and leaderboard queries. */
export function getPeriodStart(period: StatsPeriod, now = new Date()): Date | null {
  if (period === "all") return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  } else if (period === "month") {
    start.setUTCDate(1);
  } else if (period === "year") {
    start.setUTCMonth(0, 1);
  }
  return start;
}
