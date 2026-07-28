import type { ChallengeProgressDto } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

interface ChallengeCardProps {
  period: "week" | "month";
  progress: ChallengeProgressDto;
  compact?: boolean;
}

export function ChallengeCard({ period, progress, compact = false }: ChallengeCardProps) {
  const t = useT();
  const pct = Math.min(100, Math.round((progress.distanceKm / progress.goalKm) * 100));

  return (
    <section className="space-y-2 rounded-2xl bg-surface-high p-4">
      <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
        {t(`badges.challenge.${period}` as Parameters<typeof t>[0])}
      </h3>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      <p className="text-sm font-bold">
        {Math.round(progress.distanceKm)} / {progress.goalKm} km
      </p>

      {!compact && (
        <p className="text-xs text-text-muted">
          {progress.tripCount} · {progress.activeDays} · {progress.co2Kg.toFixed(1)} kg CO₂
        </p>
      )}
    </section>
  );
}
