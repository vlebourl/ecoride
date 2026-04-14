import { useState } from "react";
import { Trophy, Leaf, Flame, MapPin, Zap, Euro, Route } from "lucide-react";
import { useLeaderboard } from "@/hooks/queries";
import { useSession } from "@/lib/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { CommunityImpactBanner } from "@/components/leaderboard/CommunityImpactBanner";
import { CommunityChart } from "@/components/leaderboard/CommunityChart";
import { useT } from "@/i18n/provider";
import type { StatsPeriod, LeaderboardCategory } from "@ecoride/shared/api-contracts";
import type { TranslationKey } from "@/i18n/locales/fr";

const periodValues: StatsPeriod[] = ["week", "month", "all"];
const periodLabelKeys: Record<"week" | "month" | "all", TranslationKey> = {
  week: "leaderboard.period.week",
  month: "leaderboard.period.month",
  all: "leaderboard.period.all",
};

const categoryOptions: { value: LeaderboardCategory; icon: typeof Leaf }[] = [
  { value: "co2", icon: Leaf },
  { value: "streak", icon: Flame },
  { value: "trips", icon: MapPin },
  { value: "speed", icon: Zap },
  { value: "money", icon: Euro },
  { value: "distance", icon: Route },
];

const categoryLabelKeys: Record<LeaderboardCategory, TranslationKey> = {
  co2: "leaderboard.category.co2",
  streak: "leaderboard.category.streak",
  trips: "leaderboard.category.trips",
  speed: "leaderboard.category.speed",
  money: "leaderboard.category.money",
  distance: "leaderboard.category.distance",
};

const categoryUnitKeys: Record<LeaderboardCategory, TranslationKey> = {
  co2: "leaderboard.unit.co2",
  streak: "leaderboard.unit.streak",
  trips: "leaderboard.unit.trips",
  speed: "leaderboard.unit.speed",
  money: "leaderboard.unit.money",
  distance: "leaderboard.unit.distance",
};

export function LeaderboardPage() {
  const t = useT();
  const { data: session } = useSession();
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const [category, setCategory] = useState<LeaderboardCategory>("co2");
  const { data, isPending } = useLeaderboard(period, category);

  const unit = t(categoryUnitKeys[category]);

  const formatValue = (v: number) => {
    switch (category) {
      case "co2":
        return Number(v).toFixed(1);
      case "money":
        return Number(v).toFixed(2);
      case "speed":
        return Math.round(v);
      default:
        return v;
    }
  };

  if (isPending || !data) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title={t("leaderboard.header.title")} titleHidden />
        <div
          className="flex flex-1 items-center justify-center"
          role="status"
          aria-label={t("leaderboard.loadingAria")}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  const currentUserId = session?.user?.id;
  const entries = data.entries ?? [];
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("leaderboard.header.title")} titleHidden />

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden px-6">
        {/* Controls: period + category */}
        <section className="mb-3 shrink-0">
          <div className="flex gap-1.5" data-testid="period-switcher">
            {periodValues.map((value) => {
              const periodKey = value as "week" | "month" | "all";
              return (
                <button
                  key={value}
                  onClick={() => setPeriod(value)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    value === period
                      ? "bg-primary/20 text-primary-light"
                      : "bg-surface-high text-text-muted"
                  }`}
                >
                  {t(periodLabelKeys[periodKey])}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1.5" data-testid="category-switcher">
              {categoryOptions.map((opt) => {
                const Icon = opt.icon;
                const label = t(categoryLabelKeys[opt.value]);
                return (
                  <button
                    key={opt.value}
                    onClick={() => setCategory(opt.value)}
                    className={`flex h-8 flex-1 items-center justify-center rounded-lg transition-colors ${
                      opt.value === category
                        ? "bg-primary/20 text-primary-light"
                        : "bg-surface-high text-text-muted"
                    }`}
                    aria-label={label}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary-light">
              {t(categoryLabelKeys[category])}
            </span>
          </div>
        </section>

        {/* Leaderboard */}
        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Trophy size={40} className="text-primary-light" />
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <h3 className="text-xl font-bold">{t("leaderboard.empty.title")}</h3>
              <p className="max-w-xs text-sm text-text-muted">{t("leaderboard.empty.body")}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Podium — compact */}
            <section className="mb-3 grid grid-cols-3 items-end gap-3 shrink-0">
              {/* Rank 2 */}
              {top3[1] && (
                <div className="flex flex-col items-center">
                  <div className="relative mb-2">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-text-dim bg-surface-high">
                      <span className="text-lg font-bold text-text-muted">
                        {top3[1].name.charAt(0)}
                      </span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-surface-high text-[10px] font-bold text-text">
                      2
                    </div>
                  </div>
                  <span className="w-full truncate text-center text-[10px] font-bold">
                    {top3[1].name}
                  </span>
                  <span className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-primary-light">
                    {formatValue(top3[1].value)} {unit}
                  </span>
                </div>
              )}

              {/* Rank 1 */}
              {top3[0] && (
                <div className="flex flex-col items-center">
                  <div className="relative mb-2">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-4 border-primary shadow-[0_0_20px_rgba(84,233,138,0.3)] bg-surface-high">
                      <span className="text-2xl font-bold text-primary-light">
                        {top3[0].name.charAt(0)}
                      </span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-primary text-[10px] font-black text-bg">
                      1
                    </div>
                  </div>
                  <span className="w-full truncate text-center text-xs font-bold text-text">
                    {top3[0].name}
                  </span>
                  <span className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-primary-light">
                    {formatValue(top3[0].value)} {unit}
                  </span>
                </div>
              )}

              {/* Rank 3 */}
              {top3[2] && (
                <div className="flex flex-col items-center">
                  <div className="relative mb-2">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-surface-highest bg-surface-high">
                      <span className="text-lg font-bold text-text-muted">
                        {top3[2].name.charAt(0)}
                      </span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-surface-highest text-[10px] font-bold text-text-muted">
                      3
                    </div>
                  </div>
                  <span className="w-full truncate text-center text-[10px] font-bold">
                    {top3[2].name}
                  </span>
                  <span className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-primary-light">
                    {formatValue(top3[2].value)} {unit}
                  </span>
                </div>
              )}
            </section>

            {/* Leaderboard List — fills remaining space, clips overflow */}
            <div className="flex flex-1 min-h-0 flex-col gap-1.5 overflow-hidden">
              {rest.map((entry) => {
                const isMe = entry.userId === currentUserId;
                return (
                  <div
                    key={entry.userId}
                    className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 ${
                      isMe
                        ? "border-2 border-primary bg-surface-low shadow-[0_10px_30px_rgba(46,204,113,0.1)]"
                        : "bg-surface-low"
                    } transition-colors`}
                  >
                    <span
                      className={`w-5 text-xs font-black ${
                        isMe ? "text-primary-light" : "text-text-dim"
                      }`}
                    >
                      {String(entry.rank).padStart(2, "0")}
                    </span>
                    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-surface-high">
                      <span className="text-sm font-bold text-text-muted">
                        {entry.name.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="truncate text-xs font-bold">
                          {isMe ? t("leaderboard.you") : entry.name}
                        </h4>
                        {isMe && (
                          <span className="shrink-0 rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-light">
                            {t("leaderboard.meBadge")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-xs font-black text-text">
                        {formatValue(entry.value)} {unit.toLowerCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Community impact + chart */}
        <section className="mt-3 shrink-0 pb-3">
          <CommunityImpactBanner period={period} />
          <CommunityChart
            period={period}
            category={category}
            unit={unit}
            categoryLabel={t(categoryLabelKeys[category])}
          />
        </section>
      </div>
    </div>
  );
}
