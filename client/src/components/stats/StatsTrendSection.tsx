import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "@/i18n/provider";
import type { Metric, Period, StatsChartDatum } from "./chartData";

type StatsTrendSectionProps = {
  period: Period;
  metric: Metric;
  periodLabels: Record<Period, string>;
  metricLabels: Record<Metric, string>;
  chartData: StatsChartDatum[];
  onPeriodChange: (period: Period) => void;
  onMetricChange: (metric: Metric) => void;
};

export function StatsTrendSection({
  period,
  metric,
  periodLabels,
  metricLabels,
  chartData,
  onPeriodChange,
  onMetricChange,
}: StatsTrendSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
          {t("stats.chart.title")}
        </h3>
      </div>

      <nav className="flex items-center border-b border-surface-low">
        {(Object.keys(periodLabels) as Period[]).map((nextPeriod) => (
          <button
            key={nextPeriod}
            onClick={() => onPeriodChange(nextPeriod)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              nextPeriod === period
                ? "border-b-2 border-primary-light font-bold text-primary-light"
                : "text-text-muted hover:text-text"
            }`}
          >
            {periodLabels[nextPeriod]}
          </button>
        ))}
      </nav>

      <div className="flex gap-2">
        {(Object.keys(metricLabels) as Metric[]).map((nextMetric) => (
          <button
            key={nextMetric}
            onClick={() => onMetricChange(nextMetric)}
            className={`rounded-lg px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              nextMetric === metric
                ? "bg-primary/20 text-primary-light"
                : "bg-surface-high text-text-muted"
            }`}
          >
            {nextMetric === "km"
              ? t("stats.chart.metricShort.km")
              : nextMetric === "co2"
                ? t("stats.chart.metricShort.co2")
                : t("stats.chart.metricShort.eur")}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-outline-variant/10 bg-surface-low p-4">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#2e3842" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#8a9ba8", fontSize: 11, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              interval={period === "month" ? 4 : 0}
            />
            <YAxis
              tick={{ fill: "#8a9ba8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={48}
              unit={
                metric === "km"
                  ? ` ${t("stats.chart.unit.km")}`
                  : metric === "co2"
                    ? ` ${t("stats.chart.unit.co2")}`
                    : ` ${t("stats.chart.unit.eur")}`
              }
              tickFormatter={(value) =>
                metric === "eur" ? Number(value).toFixed(0) : Number(value).toFixed(1)
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#283240",
                border: "1px solid #333e47",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#8a9ba8", fontWeight: 600 }}
              itemStyle={{ color: "#2ecc71" }}
              formatter={(value) => [
                `${Number(value).toFixed(metric === "eur" ? 2 : 1)} ${
                  metric === "km"
                    ? t("stats.chart.unit.km")
                    : metric === "co2"
                      ? t("stats.chart.unit.co2")
                      : t("stats.chart.unit.eur")
                }`,
                metricLabels[metric],
              ]}
            />
            <Line
              type="monotone"
              dataKey={metric}
              stroke="#2ecc71"
              strokeWidth={2.5}
              dot={{ fill: "#2ecc71", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "#54e98a", strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
