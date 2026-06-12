import { Bike } from "lucide-react";
import { formatMonthYear } from "@/lib/format-utils";
import { useT } from "@/i18n/provider";

type StatsMonthlySummarySectionProps = {
  summary: {
    totalDistanceKm: number;
    totalCo2SavedKg: number;
    totalMoneySavedEur: number;
  };
  userTimezone?: string;
};

export function StatsMonthlySummarySection({
  summary,
  userTimezone,
}: StatsMonthlySummarySectionProps) {
  const t = useT();

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            {t("stats.monthly.caption")}
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight">
            {formatMonthYear(new Date(), userTimezone)}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="col-span-1 flex min-h-[160px] flex-col justify-between rounded-xl border border-outline-variant/10 bg-surface-low p-6 md:col-span-2">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
              {t("stats.monthly.totalDistance")}
            </span>
            <Bike size={22} className="text-primary-light" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-bold tracking-tighter">
              {Math.round(summary.totalDistanceKm)}
            </span>
            <span className="text-xl font-bold text-on-surface-variant">
              {t("stats.monthly.distanceUnit")}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-outline-variant/10 bg-surface-low p-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
            {t("stats.monthly.co2Saved")}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tighter">
              {Math.round(summary.totalCo2SavedKg)}
            </span>
            <span className="text-base font-bold text-primary-light">
              {t("stats.monthly.co2Unit")}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-outline-variant/10 bg-surface-low p-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
            {t("stats.monthly.savings")}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tighter">
              {Math.round(summary.totalMoneySavedEur)}
            </span>
            <span className="text-base font-bold text-primary-light">€</span>
          </div>
        </div>
      </div>
    </section>
  );
}
