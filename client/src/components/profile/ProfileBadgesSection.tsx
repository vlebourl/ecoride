import type { Achievement } from "@ecoride/shared/types";
import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { useT } from "@/i18n/provider";

interface ProfileBadgesSectionProps {
  achievements: Achievement[];
}

export function ProfileBadgesSection({ achievements }: ProfileBadgesSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">{t("profile.badges.title")}</h2>
      <BadgeGrid achievements={achievements} />
    </section>
  );
}
