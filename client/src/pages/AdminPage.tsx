import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  type AdminStatsTrip,
  type AdminStatsUser,
  useAdminHealth,
  useAdminStats,
  useDeleteAdminUser,
  useGrantAdmin,
  useGrantSuper73Access,
  useProfile,
  useRevokeAdmin,
  useRevokeSuper73Access,
  useTrip,
  useTriggerDeploy,
} from "@/hooks/queries";
import { useT } from "@/i18n/provider";
import { useNavigate } from "react-router";
import { AdminOverviewStats } from "@/components/admin/AdminOverviewStats";
import { AuditLogSection } from "@/components/admin/AuditLogSection";
import { AdminRecentTripsSection } from "@/components/admin/AdminRecentTripsSection";
import { AdminSystemSection } from "@/components/admin/AdminSystemSection";
import { AdminTripDetailSheet } from "@/components/admin/AdminTripDetailSheet";
import { AdminUserDrawer } from "@/components/admin/AdminUserDrawer";
import { AdminUsersSection } from "@/components/admin/AdminUsersSection";
import { AnnouncementSection } from "@/components/admin/AnnouncementSection";
import { NotificationSection } from "@/components/admin/NotificationSection";

export function AdminPage() {
  const t = useT();
  const navigate = useNavigate();
  const { data: profileData, isPending: profilePending } = useProfile();
  const { data: health, isPending: healthPending } = useAdminHealth();
  const { data: stats, isPending: statsPending } = useAdminStats();
  const triggerDeploy = useTriggerDeploy();
  const grantAdmin = useGrantAdmin();
  const revokeAdmin = useRevokeAdmin();
  const grantSuper73Access = useGrantSuper73Access();
  const revokeSuper73Access = useRevokeSuper73Access();
  const deleteAdminUser = useDeleteAdminUser();
  const [selectedUser, setSelectedUser] = useState<AdminStatsUser | null>(null);
  const [selectedAdminTrip, setSelectedAdminTrip] = useState<AdminStatsTrip | null>(null);
  const { data: adminTripDetail, isPending: adminTripPending } = useTrip(
    selectedAdminTrip?.id ?? null,
  );

  const isAdmin = profileData?.user?.isAdmin === true;
  const userActionBusy =
    grantAdmin.isPending ||
    revokeAdmin.isPending ||
    grantSuper73Access.isPending ||
    revokeSuper73Access.isPending ||
    deleteAdminUser.isPending;

  useEffect(() => {
    if (!profilePending && profileData?.user && !profileData.user.isAdmin) {
      navigate("/", { replace: true });
    }
  }, [profilePending, profileData, navigate]);

  if (profilePending) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        role="status"
        aria-label={t("admin.loadingAria")}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const chartData = (stats?.dailyTripCounts ?? []).map((day) => ({
    date: new Date(day.date + "T00:00:00").toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
    }),
    count: day.count,
  }));

  const mergeSelectedUser = (
    userPatch: Pick<AdminStatsUser, "id" | "name" | "email" | "isAdmin" | "super73Enabled">,
  ) => {
    setSelectedUser((current) => (current ? { ...current, ...userPatch } : current));
  };

  return (
    <>
      <PageHeader
        title={t("admin.header.title")}
        back={{ to: "/", label: t("admin.header.backAria") }}
        right={<Shield size={18} className="text-primary-light" aria-hidden="true" />}
      />

      <div className="space-y-6 px-6 pb-6">
        <AdminSystemSection
          health={health}
          healthPending={healthPending}
          triggerDeployPending={triggerDeploy.isPending}
          onTriggerDeploy={(callbacks) => triggerDeploy.mutate(undefined, callbacks)}
        />

        <AdminOverviewStats health={health} healthPending={healthPending} />

        <section className="rounded-xl bg-surface-low p-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
            {t("admin.chart.title")}
          </h2>
          {statsPending ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#2d3436",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#dfe6e9",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#dfe6e9" }}
                />
                <Bar
                  dataKey="count"
                  fill="#2ecc71"
                  radius={[4, 4, 0, 0]}
                  name={t("admin.chart.tripsLabel")}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">{t("admin.chart.empty")}</p>
          )}
        </section>

        <AdminUsersSection
          users={stats?.users ?? []}
          statsPending={statsPending}
          onSelectUser={setSelectedUser}
        />

        <AuditLogSection />

        <AdminRecentTripsSection
          trips={stats?.recentTrips ?? []}
          statsPending={statsPending}
          onSelectTrip={setSelectedAdminTrip}
        />

        <AnnouncementSection />
        <NotificationSection users={stats?.users} />
      </div>

      <AdminUserDrawer
        selectedUser={selectedUser}
        currentUserId={profileData?.user?.id}
        userActionBusy={userActionBusy}
        onClose={() => setSelectedUser(null)}
        onGrantAdmin={(user) =>
          grantAdmin.mutate(
            { email: user.email },
            { onSuccess: (data) => mergeSelectedUser(data.user) },
          )
        }
        onRevokeAdmin={(user) =>
          revokeAdmin.mutate(
            { userId: user.id },
            { onSuccess: (data) => mergeSelectedUser(data.user) },
          )
        }
        onGrantSuper73Access={(user) =>
          grantSuper73Access.mutate(
            { userId: user.id },
            { onSuccess: (data) => mergeSelectedUser(data.user) },
          )
        }
        onRevokeSuper73Access={(user) =>
          revokeSuper73Access.mutate(
            { userId: user.id },
            { onSuccess: (data) => mergeSelectedUser(data.user) },
          )
        }
        onDeleteUser={(user) =>
          deleteAdminUser.mutate({ userId: user.id }, { onSuccess: () => setSelectedUser(null) })
        }
      />

      <AdminTripDetailSheet
        selectedTrip={selectedAdminTrip}
        tripDetail={adminTripDetail}
        isPending={adminTripPending}
        onClose={() => setSelectedAdminTrip(null)}
      />
    </>
  );
}
