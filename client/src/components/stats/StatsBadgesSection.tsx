import type { Achievement } from "@ecoride/shared/types";
import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { useT } from "@/i18n/provider";

type StatsBadgesSectionProps = {
  achievements: Achievement[];
};

export function StatsBadgesSection({ achievements }: StatsBadgesSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
        {t("stats.badges.title")}
      </h3>
      <BadgeGrid achievements={achievements} />
    </section>
  );
}
