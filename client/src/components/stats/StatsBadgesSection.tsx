import { BADGES, type BadgeId } from "@ecoride/shared/types";
import type { Achievement } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

const allBadgeIds = Object.keys(BADGES) as BadgeId[];

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
      <div className="grid grid-cols-4 gap-4">
        {allBadgeIds.map((id) => {
          const badge = BADGES[id];
          const unlocked = achievements.some((achievement) => achievement.badgeId === id);

          return (
            <div
              key={id}
              className={`flex flex-col items-center gap-2 ${!unlocked ? "opacity-40" : ""}`}
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                  unlocked ? "bg-primary/10 text-primary-light" : "bg-surface-high text-text-dim"
                }`}
              >
                <span className="text-2xl">{badge.icon}</span>
              </div>
              <span className="text-center text-xs font-bold uppercase leading-tight text-text-muted">
                {badge.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
