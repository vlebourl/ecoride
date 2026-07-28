import { BADGES, BADGE_CATEGORIES, type BadgeId } from "@ecoride/shared/types";
import type { Achievement } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

const badgesByCategory = BADGE_CATEGORIES.map((category) => ({
  category,
  ids: (Object.keys(BADGES) as BadgeId[]).filter((id) => BADGES[id].category === category),
}));

interface BadgeGridProps {
  achievements: Achievement[];
}

export function BadgeGrid({ achievements }: BadgeGridProps) {
  const t = useT();
  const unlocked = new Set(achievements.map((a) => a.badgeId));

  return (
    <div className="space-y-6">
      {badgesByCategory.map(({ category, ids }) => {
        const count = ids.filter((id) => unlocked.has(id)).length;

        return (
          <section key={category} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                {t(`badges.category.${category}` as Parameters<typeof t>[0])}
              </h3>
              <span className="text-xs font-bold text-text-dim">
                {count}/{ids.length}
              </span>
            </div>
            <ul className="grid grid-cols-4 gap-4">
              {ids.map((id) => {
                const badge = BADGES[id];
                const isUnlocked = unlocked.has(id);

                return (
                  <li
                    key={id}
                    className={`flex flex-col items-center gap-2 ${!isUnlocked ? "opacity-40" : ""}`}
                  >
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                        isUnlocked
                          ? "bg-primary/10 text-primary-light"
                          : "bg-surface-high text-text-dim"
                      }`}
                    >
                      <span className="text-2xl">{badge.icon}</span>
                    </div>
                    <span className="text-center text-xs font-bold uppercase leading-tight text-text-muted">
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
