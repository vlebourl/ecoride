import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useCommunityTimeline } from "@/hooks/queries";
import { useT } from "@/i18n/provider";
import type { StatsPeriod, LeaderboardCategory } from "@ecoride/shared/api-contracts";

interface Props {
  period: StatsPeriod;
  category: LeaderboardCategory;
  unit: string;
  categoryLabel: string;
}

interface TooltipPayloadItem {
  value?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  unit: string;
  formatValue: (v: number) => string;
}

function formatDateLabel(dateStr: string, period: StatsPeriod): string {
  const date = new Date(dateStr + "T00:00:00Z");
  if (period === "all") {
    return date.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });
  }
  if (period === "week") {
    return date.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" });
  }
  // month: just the day number
  return String(date.getUTCDate());
}

function CustomTooltip({ active, payload, label, unit, formatValue }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-border bg-surface-container px-3 py-2 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-sm font-black text-primary-light">
        {formatValue(value)} {unit}
      </p>
    </div>
  );
}

export function CommunityChart({ period, category, unit, categoryLabel }: Props) {
  const t = useT();
  const { data, isPending } = useCommunityTimeline(period, category);

  const formatValue = (v: number) => {
    switch (category) {
      case "co2":
        return v.toFixed(1);
      case "money":
        return v.toFixed(2);
      case "speed":
        return Math.round(v).toString();
      default:
        return Math.round(v).toString();
    }
  };

  if (isPending || !data) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 h-3 w-32 animate-pulse rounded bg-surface-container" />
        <div className="flex-1 min-h-0 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  const tickInterval = period === "month" ? 4 : 0;

  const points = data.points.map((p) => ({
    date: p.date,
    label: formatDateLabel(p.date, period),
    value: p.value,
  }));

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">
        {t("community.chart.title")}
        {" · "}
        <span className="text-primary-light">{categoryLabel}</span>
      </h2>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="communityChartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#54e98a" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#54e98a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: "#8a9ba8", fontSize: 10, fontWeight: 600 }}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
          />
          <Tooltip
            content={<CustomTooltip unit={unit} formatValue={formatValue} />}
            cursor={{ stroke: "#54e98a", strokeWidth: 1, strokeDasharray: "4 4" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#54e98a"
            strokeWidth={2}
            fill="url(#communityChartGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#54e98a", stroke: "#1e272e", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
