import { Leaf, Droplets, Euro, Route, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { useCountUp } from "@/hooks/useCountUp";
import { useCommunityStats } from "@/hooks/queries";
import { useT } from "@/i18n/provider";
import type { StatsPeriod } from "@ecoride/shared/api-contracts";

// CO₂ equivalence ratios (sources in comments)
// 1 round-trip Paris–NYC flight ≈ 1 760 kg CO₂ (ADEME/ICAO 2023)
const KG_PER_FLIGHT = 1760;
// 1 tree absorbs ≈ 25 kg CO₂/year (ONF estimate)
const KG_PER_TREE_YEAR = 25;

function formatCo2(kg: number): { value: string; unit: string } {
  if (kg >= 1000) {
    return { value: (kg / 1000).toFixed(1), unit: "t" };
  }
  return { value: kg.toFixed(1), unit: "kg" };
}

function AnimatedStatCard({
  icon,
  rawValue,
  displayValue,
  unit,
  testId,
}: {
  icon: LucideIcon;
  rawValue: number;
  displayValue: (v: number) => string;
  unit: string;
  testId: string;
}) {
  const animated = useCountUp(rawValue);
  return (
    <div data-testid={testId}>
      <StatCard icon={icon} value={displayValue(animated)} unit={unit} />
    </div>
  );
}

interface Props {
  period: StatsPeriod;
}

export function CommunityImpactBanner({ period }: Props) {
  const t = useT();
  const { data, isPending } = useCommunityStats(period);

  if (isPending || !data) {
    return (
      <div
        className="mb-4 grid grid-cols-3 gap-2"
        data-testid="community-banner-skeleton"
        aria-busy="true"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl bg-surface-container animate-pulse" />
        ))}
        <div className="rounded-xl bg-surface-container animate-pulse h-10" />
      </div>
    );
  }

  const { totalCo2SavedKg, totalFuelSavedL, totalMoneySavedEur, totalDistanceKm, activeUsers } =
    data;

  const co2 = formatCo2(totalCo2SavedKg);
  const flights = Math.round(totalCo2SavedKg / KG_PER_FLIGHT);
  const trees = Math.round(totalCo2SavedKg / KG_PER_TREE_YEAR);

  return (
    <div className="mb-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">
        {t("community.title")}
      </h2>

      <div className="grid grid-cols-3 gap-2" data-testid="community-banner">
        <AnimatedStatCard
          icon={Leaf}
          rawValue={totalCo2SavedKg >= 1000 ? totalCo2SavedKg / 1000 : totalCo2SavedKg}
          displayValue={(v) => (totalCo2SavedKg >= 1000 ? v.toFixed(1) : Math.round(v).toString())}
          unit={co2.unit}
          testId="community-banner-co2"
        />
        <AnimatedStatCard
          icon={Droplets}
          rawValue={totalFuelSavedL}
          displayValue={(v) => Math.round(v).toString()}
          unit={t("community.unit.liters")}
          testId="community-banner-fuel"
        />
        <AnimatedStatCard
          icon={Euro}
          rawValue={totalMoneySavedEur}
          displayValue={(v) => Math.round(v).toString()}
          unit={t("community.unit.euros")}
          testId="community-banner-money"
        />
        <AnimatedStatCard
          icon={Route}
          rawValue={totalDistanceKm}
          displayValue={(v) => Math.round(v).toString()}
          unit={t("community.unit.km")}
          testId="community-banner-distance"
        />
        <AnimatedStatCard
          icon={Users}
          rawValue={activeUsers}
          displayValue={(v) => Math.round(v).toString()}
          unit={t("community.unit.users")}
          testId="community-banner-users"
        />
      </div>

      {totalCo2SavedKg > 0 && (
        <p
          className="mt-2 text-[11px] text-text-dim leading-relaxed"
          data-testid="community-banner-comparisons"
        >
          {flights > 0 && t("community.comparisons.flights", { count: flights.toString() })}
          {flights > 0 && trees > 0 && " · "}
          {trees > 0 && t("community.comparisons.trees", { count: trees.toString() })}
        </p>
      )}
    </div>
  );
}
