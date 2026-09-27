import { BADGES, BADGE_CATEGORIES, type BadgeId } from "@ecoride/shared/types";
import type { Achievement } from "@ecoride/shared/types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { BADGE_EXPLANATIONS } from "./badge-explanations";

const badgesByCategory = BADGE_CATEGORIES.map((category) => ({
  category,
  ids: (Object.keys(BADGES) as BadgeId[]).filter((id) => BADGES[id].category === category),
}));

interface BadgeGridProps {
  achievements: Achievement[];
}

export function BadgeGrid({ achievements }: BadgeGridProps) {
  const { t, locale } = useI18n();
  const [selectedBadge, setSelectedBadge] = useState<BadgeId | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const unlocked = new Set(achievements.map((a) => a.badgeId));

  const closeBadge = () => {
    setSelectedBadge(null);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!selectedBadge) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBadge();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedBadge]);

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
                  <li key={id}>
                    <button
                      type="button"
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setSelectedBadge(id);
                      }}
                      className={`flex w-full flex-col items-center gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-primary ${!isUnlocked ? "opacity-40" : ""}`}
                    >
                      <span
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                          isUnlocked
                            ? "bg-primary/10 text-primary-light"
                            : "bg-surface-high text-text-dim"
                        }`}
                      >
                        <span className="text-2xl" aria-hidden="true">
                          {badge.icon}
                        </span>
                      </span>
                      <span className="text-center text-xs font-bold uppercase leading-tight text-text-muted">
                        {badge.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {selectedBadge &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="badge-detail-title"
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
            onClick={closeBadge}
            onKeyDown={(event) => {
              if (event.key === "Tab") event.preventDefault();
            }}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl bg-surface-container p-6 pb-10"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl" aria-hidden="true">
                    {BADGES[selectedBadge].icon}
                  </span>
                  <h3 id="badge-detail-title" className="text-lg font-bold">
                    {BADGES[selectedBadge].label}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeBadge}
                  autoFocus
                  aria-label={t("badges.detail.close")}
                  className="rounded-lg p-2 text-text-muted focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary-light">
                {t(unlocked.has(selectedBadge) ? "badges.detail.unlocked" : "badges.detail.locked")}
              </p>
              <p className="text-sm text-text-muted">{BADGE_EXPLANATIONS[selectedBadge][locale]}</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
