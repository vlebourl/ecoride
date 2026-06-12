import type { AdminStatsUser } from "@/hooks/queries";
import { formatDate } from "@/lib/format-utils";
import { useT } from "@/i18n/provider";

type AdminUsersSectionProps = {
  users: AdminStatsUser[];
  statsPending: boolean;
  onSelectUser: (user: AdminStatsUser) => void;
};

export function AdminUsersSection({ users, statsPending, onSelectUser }: AdminUsersSectionProps) {
  const t = useT();

  return (
    <section className="rounded-xl bg-surface-low p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          {t("admin.users.title")}
        </h2>
        <p className="text-xs text-text-dim">{t("admin.users.hint")}</p>
      </div>
      {statsPending ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : users.length > 0 ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs font-bold uppercase tracking-widest text-text-dim">
                <th className="pb-3 pr-4">{t("admin.users.col.name")}</th>
                <th className="pb-3 pr-4">{t("admin.users.col.email")}</th>
                <th className="pb-3 pr-4 text-right">{t("admin.users.col.trips")}</th>
                <th className="pb-3 pr-4 text-right">{t("admin.users.col.co2")}</th>
                <th className="pb-3 pr-4 text-right">{t("admin.users.col.access")}</th>
                <th className="pb-3 text-right">{t("admin.users.col.signedUp")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="cursor-pointer border-b border-white/5 transition-colors hover:bg-surface-high last:border-0"
                  onClick={() => onSelectUser(user)}
                >
                  <td className="py-3 pr-4 font-medium text-text">
                    {user.name}
                    {user.isAdmin && (
                      <span className="ml-2 inline-flex items-center rounded bg-primary/20 px-1.5 py-0.5 text-xs font-bold text-primary-light">
                        {t("admin.users.badgeAdmin")}
                      </span>
                    )}
                    {user.super73Enabled && (
                      <span className="ml-2 inline-flex items-center rounded bg-sky-500/20 px-1.5 py-0.5 text-xs font-bold text-sky-300">
                        {t("admin.users.badgeS73")}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-text-muted">{user.email}</td>
                  <td className="py-3 pr-4 text-right text-text">{user.tripCount}</td>
                  <td className="py-3 pr-4 text-right text-text">
                    {typeof user.totalCo2 === "number" ? user.totalCo2.toFixed(1) : "0.0"}
                  </td>
                  <td className="py-3 pr-4 text-right text-text-dim">
                    {user.isAdmin && user.super73Enabled
                      ? t("admin.users.accessAdminS73")
                      : user.isAdmin
                        ? t("admin.users.accessAdmin")
                        : user.super73Enabled
                          ? t("admin.users.accessS73")
                          : t("admin.users.accessStandard")}
                  </td>
                  <td className="py-3 text-right text-text-muted">{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-text-muted">{t("admin.users.empty")}</p>
      )}
    </section>
  );
}
