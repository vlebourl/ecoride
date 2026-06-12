import { Calendar, CalendarDays, MapPin, Users } from "lucide-react";
import type { AdminHealthData } from "@/hooks/queries";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { useT } from "@/i18n/provider";

type AdminOverviewStatsProps = {
  health: AdminHealthData | undefined;
  healthPending: boolean;
};

export function AdminOverviewStats({ health, healthPending }: AdminOverviewStatsProps) {
  const t = useT();

  return (
    <section className="grid grid-cols-2 gap-4">
      <AdminStatCard
        icon={<Users size={18} className="text-primary-light" />}
        label={t("admin.stats.users")}
        value={health?.userCount}
        loading={healthPending}
      />
      <AdminStatCard
        icon={<MapPin size={18} className="text-primary-light" />}
        label={t("admin.stats.totalTrips")}
        value={health?.tripCount}
        loading={healthPending}
      />
      <AdminStatCard
        icon={<Calendar size={18} className="text-primary-light" />}
        label={t("admin.stats.today")}
        value={health?.tripsToday}
        loading={healthPending}
      />
      <AdminStatCard
        icon={<CalendarDays size={18} className="text-primary-light" />}
        label={t("admin.stats.thisWeek")}
        value={health?.tripsThisWeek}
        loading={healthPending}
      />
    </section>
  );
}
