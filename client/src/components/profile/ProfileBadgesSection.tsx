import { BADGES } from "@ecoride/shared/types";
import type { Achievement, BadgeId } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

const allBadgeIds = Object.keys(BADGES) as BadgeId[];

interface ProfileBadgesSectionProps {
  achievements: Achievement[];
}

export function ProfileBadgesSection({ achievements }: ProfileBadgesSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-lg font-bold tracking-tight">{t("profile.badges.title")}</h2>
      </div>
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
