import type { Achievement, ChallengeProgressDto } from "@ecoride/shared/types";
import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { ChallengeCard } from "@/components/badges/ChallengeCard";
import { useT } from "@/i18n/provider";

type StatsBadgesSectionProps = {
  achievements: Achievement[];
  challenges?: { week: ChallengeProgressDto; month: ChallengeProgressDto };
};

export function StatsBadgesSection({ achievements, challenges }: StatsBadgesSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      {challenges && (
        <div className="space-y-3">
          <ChallengeCard period="week" progress={challenges.week} />
          <ChallengeCard period="month" progress={challenges.month} />
        </div>
      )}
      <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
        {t("stats.badges.title")}
      </h3>
      <BadgeGrid achievements={achievements} />
    </section>
  );
}
