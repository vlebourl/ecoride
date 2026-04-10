import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import {
  Shield,
  Users,
  MapPin,
  Calendar,
  CalendarDays,
  Database,
  Clock,
  Bike,
  Check,
  Rocket,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  useAdminHealth,
  useAdminStats,
  useTriggerDeploy,
  useProfile,
  useGrantAdmin,
  useRevokeAdmin,
  useGrantSuper73Access,
  useRevokeSuper73Access,
  useDeleteAdminUser,
} from "@/hooks/queries";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatUptime, formatDate, formatDuration } from "@/lib/format-utils";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { AuditLogSection } from "@/components/admin/AuditLogSection";
import { AnnouncementSection } from "@/components/admin/AnnouncementSection";
import { NotificationSection } from "@/components/admin/NotificationSection";

type AdminManagedUser = {
  id: string;
  name: string;
  email: string;
  tripCount: number;
  totalCo2: number;
  createdAt: string;
  isAdmin: boolean;
  super73Enabled: boolean;
};

export function AdminPage() {
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
  const [deployStatus, setDeployStatus] = useState<"idle" | "success" | "error">("idle");
  const [selectedUser, setSelectedUser] = useState<AdminManagedUser | null>(null);

  const isAdmin = profileData?.user?.isAdmin === true;

  // Redirect non-admin users
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
        aria-label="Chargement"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const userActionBusy =
    grantAdmin.isPending ||
    revokeAdmin.isPending ||
    grantSuper73Access.isPending ||
    revokeSuper73Access.isPending ||
    deleteAdminUser.isPending;

  const mergeSelectedUser = (
    userPatch: Pick<AdminManagedUser, "id" | "name" | "email" | "isAdmin" | "super73Enabled">,
  ) => {
    setSelectedUser((current) => (current ? { ...current, ...userPatch } : current));
  };

  const chartData = stats?.dailyTripCounts.map((d) => ({
    date: new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
    }),
    count: d.count,
  }));

  return (
    <>
      <PageHeader
        title="Admin"
        back={{ to: "/" }}
        right={<Shield size={18} className="text-primary-light" aria-hidden="true" />}
      />

      <div className="space-y-6 px-6 pb-6">
        {/* System Info Card */}
        <section className="rounded-xl bg-surface-low p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">Systeme</h2>
            <button
              onClick={() => {
                setDeployStatus("idle");
                triggerDeploy.mutate(undefined, {
                  onSuccess: () => {
                    setDeployStatus("success");
                    setTimeout(() => setDeployStatus("idle"), 3000);
                  },
                  onError: () => {
                    setDeployStatus("error");
                    setTimeout(() => setDeployStatus("idle"), 3000);
                  },
                });
              }}
              disabled={triggerDeploy.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-bold text-primary-light active:scale-95 disabled:opacity-50"
            >
              {triggerDeploy.isPending ? (
                <div className="h-3 w-3 animate-spin rounded-full border border-primary-light border-t-transparent" />
              ) : deployStatus === "success" ? (
                <Check size={12} />
              ) : deployStatus === "error" ? (
                <span className="text-danger">Erreur</span>
              ) : (
                <Rocket size={12} />
              )}
              {deployStatus === "success"
                ? "Déployé !"
                : deployStatus === "error"
                  ? "Échec"
                  : "Déployer"}
            </button>
          </div>
          {healthPending ? (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : health ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-bold uppercase text-text-dim">Version</span>
                <span className="text-sm font-bold text-text">{health.version}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Clock size={14} className="text-text-dim" />
                <span className="text-xs font-bold uppercase text-text-dim">Uptime</span>
                <span className="text-sm font-bold text-text">{formatUptime(health.uptime)}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Database size={14} className="text-text-dim" />
                <span className="text-xs font-bold uppercase text-text-dim">DB</span>
                <span
                  className={`text-sm font-bold ${health.dbConnected ? "text-primary-light" : "text-danger"}`}
                >
                  {health.dbConnected ? "OK" : "DOWN"}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Database size={14} className="text-text-dim" />
                <span className="text-xs font-bold uppercase text-text-dim">Taille DB</span>
                <span className="text-sm font-bold text-text">{health.dbSizeMb.toFixed(1)} MB</span>
              </div>
            </div>
          ) : null}
        </section>

        {/* Stats Cards Row */}
        <section className="grid grid-cols-2 gap-4">
          <AdminStatCard
            icon={<Users size={18} className="text-primary-light" />}
            label="Utilisateurs"
            value={health?.userCount}
            loading={healthPending}
          />
          <AdminStatCard
            icon={<MapPin size={18} className="text-primary-light" />}
            label="Trajets total"
            value={health?.tripCount}
            loading={healthPending}
          />
          <AdminStatCard
            icon={<Calendar size={18} className="text-primary-light" />}
            label="Aujourd'hui"
            value={health?.tripsToday}
            loading={healthPending}
          />
          <AdminStatCard
            icon={<CalendarDays size={18} className="text-primary-light" />}
            label="Cette semaine"
            value={health?.tripsThisWeek}
            loading={healthPending}
          />
        </section>

        {/* Chart: trips per day (last 7 days) */}
        <section className="rounded-xl bg-surface-low p-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
            Trajets — 7 derniers jours
          </h2>
          {statsPending ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : chartData && chartData.length > 0 ? (
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
                <Bar dataKey="count" fill="#2ecc71" radius={[4, 4, 0, 0]} name="Trajets" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">Aucune donnee</p>
          )}
        </section>

        {/* Users Table */}
        <section className="rounded-xl bg-surface-low p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              Utilisateurs
            </h2>
            <p className="text-xs text-text-dim">
              Touchez un utilisateur pour ouvrir le panneau d’administration.
            </p>
          </div>
          {statsPending ? (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : stats?.users && stats.users.length > 0 ? (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-xs font-bold uppercase tracking-widest text-text-dim">
                    <th className="pb-3 pr-4">Nom</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4 text-right">Trajets</th>
                    <th className="pb-3 pr-4 text-right">CO2 (kg)</th>
                    <th className="pb-3 pr-4 text-right">Accès</th>
                    <th className="pb-3 text-right">Inscrit</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.users.map((u) => (
                    <tr
                      key={u.id}
                      className="cursor-pointer border-b border-white/5 transition-colors hover:bg-surface-high last:border-0"
                      onClick={() => setSelectedUser(u)}
                    >
                      <td className="py-3 pr-4 font-medium text-text">
                        {u.name}
                        {u.isAdmin && (
                          <span className="ml-2 inline-flex items-center rounded bg-primary/20 px-1.5 py-0.5 text-xs font-bold text-primary-light">
                            admin
                          </span>
                        )}
                        {u.super73Enabled && (
                          <span className="ml-2 inline-flex items-center rounded bg-sky-500/20 px-1.5 py-0.5 text-xs font-bold text-sky-300">
                            s73
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-text-muted">{u.email}</td>
                      <td className="py-3 pr-4 text-right text-text">{u.tripCount}</td>
                      <td className="py-3 pr-4 text-right text-text">
                        {typeof u.totalCo2 === "number" ? u.totalCo2.toFixed(1) : "0.0"}
                      </td>
                      <td className="py-3 pr-4 text-right text-text-dim">
                        {u.isAdmin && u.super73Enabled
                          ? "admin · s73"
                          : u.isAdmin
                            ? "admin"
                            : u.super73Enabled
                              ? "s73"
                              : "standard"}
                      </td>
                      <td className="py-3 text-right text-text-muted">{formatDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">Aucun utilisateur</p>
          )}
        </section>

        {/* Recent Activity (Audit Log) */}
        <AuditLogSection />

        {/* Recent Trips */}
        <section className="rounded-xl bg-surface-low p-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
            Derniers trajets
          </h2>
          {statsPending ? (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : stats?.recentTrips && stats.recentTrips.length > 0 ? (
            <div className="max-h-80 space-y-3 overflow-auto">
              {stats.recentTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="flex items-center gap-3 rounded-lg bg-surface-high p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Bike size={18} className="text-primary-light" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-bold text-text">{trip.userName}</span>
                      <span className="shrink-0 text-xs text-text-dim">
                        {trip.distanceKm.toFixed(1)} km
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>{formatDate(trip.startedAt)}</span>
                      <span>-</span>
                      <span>{formatDuration(trip.durationSec)}</span>
                      <span>-</span>
                      <span>{trip.co2SavedKg.toFixed(1)} kg CO2</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">Aucun trajet</p>
          )}
        </section>
        {/* Announcements */}
        <AnnouncementSection />

        {/* Push Notifications */}
        <NotificationSection users={stats?.users} />
      </div>
      {selectedUser &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 sm:items-stretch">
            <div className="absolute inset-0" onClick={() => setSelectedUser(null)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Administration de ${selectedUser.name}`}
              className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] animate-[slideUp_0.2s_ease-out] sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-2xl"
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
                    Utilisateur
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-text">
                    {selectedUser.name}
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">{selectedUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="rounded-lg p-2 text-text-dim transition-colors hover:bg-surface-high hover:text-text"
                  aria-label="Fermer le panneau utilisateur"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto">
                <section className="rounded-xl bg-surface-low p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
                    Résumé
                  </h3>
                  <div className="mt-3 space-y-2 text-sm text-text-muted">
                    <div className="flex items-center justify-between">
                      <span>Trajets</span>
                      <span className="font-bold text-text">{selectedUser.tripCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>CO2 cumulé</span>
                      <span className="font-bold text-text">
                        {selectedUser.totalCo2.toFixed(1)} kg
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Inscription</span>
                      <span className="font-bold text-text">
                        {formatDate(selectedUser.createdAt)}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl bg-surface-low p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
                    Actions
                  </h3>
                  <div className="mt-3 grid gap-3">
                    <button
                      type="button"
                      disabled={userActionBusy}
                      onClick={() =>
                        selectedUser.isAdmin
                          ? revokeAdmin.mutate(
                              { userId: selectedUser.id },
                              { onSuccess: (data) => mergeSelectedUser(data.user) },
                            )
                          : grantAdmin.mutate(
                              { email: selectedUser.email },
                              { onSuccess: (data) => mergeSelectedUser(data.user) },
                            )
                      }
                      className={`rounded-xl px-4 py-3 text-left text-sm font-bold transition-colors disabled:opacity-50 ${
                        selectedUser.isAdmin
                          ? "bg-danger/15 text-danger"
                          : "bg-primary/20 text-primary-light"
                      }`}
                    >
                      {selectedUser.isAdmin ? "Retirer admin" : "Rendre admin"}
                    </button>
                    <button
                      type="button"
                      disabled={userActionBusy}
                      onClick={() =>
                        selectedUser.super73Enabled
                          ? revokeSuper73Access.mutate(
                              { userId: selectedUser.id },
                              { onSuccess: (data) => mergeSelectedUser(data.user) },
                            )
                          : grantSuper73Access.mutate(
                              { userId: selectedUser.id },
                              { onSuccess: (data) => mergeSelectedUser(data.user) },
                            )
                      }
                      className={`rounded-xl px-4 py-3 text-left text-sm font-bold transition-colors disabled:opacity-50 ${
                        selectedUser.super73Enabled
                          ? "bg-surface-high text-text"
                          : "bg-sky-500/20 text-sky-300"
                      }`}
                    >
                      {selectedUser.super73Enabled ? "Retirer accès S73" : "Accorder accès S73"}
                    </button>
                    <button
                      type="button"
                      disabled={userActionBusy || selectedUser.id === profileData?.user?.id}
                      onClick={() => {
                        if (!window.confirm(`Supprimer définitivement ${selectedUser.email} ?`))
                          return;
                        deleteAdminUser.mutate(
                          { userId: selectedUser.id },
                          { onSuccess: () => setSelectedUser(null) },
                        );
                      }}
                      className="rounded-xl bg-danger/15 px-4 py-3 text-left text-sm font-bold text-danger transition-colors disabled:opacity-50"
                    >
                      Supprimer l’utilisateur
                    </button>
                    {selectedUser.id === profileData?.user?.id && (
                      <p className="text-xs text-text-dim">
                        Vous ne pouvez pas vous supprimer ni vous rétrograder depuis ce panneau.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
