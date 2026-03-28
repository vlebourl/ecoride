import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import {
  Shield,
  Users,
  MapPin,
  Calendar,
  CalendarDays,
  Database,
  Clock,
  ArrowLeft,
  Bike,
  Send,
  Bell,
  Check,
  Megaphone,
  Trash2,
  Rocket,
  Activity,
} from "lucide-react";
import {
  useAdminHealth,
  useAdminStats,
  useAdminNotifications,
  useAdminAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useSendAdminNotification,
  useAdminAuditLogs,
  useTriggerDeploy,
  useProfile,
} from "@/hooks/queries";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m}min`;
}

export function AdminPage() {
  const navigate = useNavigate();
  const { data: profileData, isPending: profilePending } = useProfile();
  const { data: health, isPending: healthPending } = useAdminHealth();
  const { data: stats, isPending: statsPending } = useAdminStats();
  const triggerDeploy = useTriggerDeploy();
  const [deployStatus, setDeployStatus] = useState<"idle" | "success" | "error">("idle");

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

  const chartData = stats?.dailyTripCounts.map((d) => ({
    date: new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
    }),
    count: d.count,
  }));

  return (
    <>
      {/* Header */}
      <header
        role="banner"
        className="sticky top-0 z-40 flex items-center gap-3 bg-bg/80 px-6 py-4 backdrop-blur-xl"
      >
        <Link to="/" className="rounded-lg p-1 text-text-muted hover:text-text" aria-label="Retour">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-primary-light" />
          <span className="text-xl font-bold tracking-tighter">
            <span className="text-text">Admin</span>
            <span className="text-text-dim"> — </span>
            <span className="text-text">eco</span>
            <span className="text-primary-light">Ride</span>
          </span>
        </div>
      </header>

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
          <StatCard
            icon={<Users size={18} className="text-primary-light" />}
            label="Utilisateurs"
            value={health?.userCount}
            loading={healthPending}
          />
          <StatCard
            icon={<MapPin size={18} className="text-primary-light" />}
            label="Trajets total"
            value={health?.tripCount}
            loading={healthPending}
          />
          <StatCard
            icon={<Calendar size={18} className="text-primary-light" />}
            label="Aujourd'hui"
            value={health?.tripsToday}
            loading={healthPending}
          />
          <StatCard
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
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
            Utilisateurs
          </h2>
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
                    <th className="pb-3 text-right">Inscrit</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 last:border-0">
                      <td className="py-3 pr-4 font-medium text-text">
                        {u.name}
                        {u.isAdmin && (
                          <span className="ml-2 inline-flex items-center rounded bg-primary/20 px-1.5 py-0.5 text-xs font-bold text-primary-light">
                            admin
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-text-muted">{u.email}</td>
                      <td className="py-3 pr-4 text-right text-text">{u.tripCount}</td>
                      <td className="py-3 pr-4 text-right text-text">
                        {typeof u.totalCo2 === "number" ? u.totalCo2.toFixed(1) : "0.0"}
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
    </>
  );
}

function AuditLogSection() {
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const { data: logs, isPending } = useAdminAuditLogs({
    userId: userId || undefined,
    action: action || undefined,
  });

  return (
    <section className="rounded-xl bg-surface-low p-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity size={14} className="text-text-dim" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          Activité récente
        </h2>
      </div>
      <div className="mb-3 flex gap-2">
        <input
          type="text"
          placeholder="Filtrer par user ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="flex-1 rounded-lg bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="text"
          placeholder="Filtrer par action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="flex-1 rounded-lg bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      {isPending ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : logs && logs.length > 0 ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs font-bold uppercase tracking-widest text-text-dim">
                <th className="pb-3 pr-4">Action</th>
                <th className="pb-3 pr-4">Utilisateur</th>
                <th className="pb-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-white/5 last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs text-text">{log.action}</td>
                  <td className="py-2 pr-4 text-xs text-text-muted">{log.userName}</td>
                  <td className="py-2 text-right text-xs text-text-dim">
                    {new Date(log.createdAt).toLocaleString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-text-muted">Aucune activité</p>
      )}
    </section>
  );
}

function AnnouncementSection() {
  const { data: list, isPending } = useAdminAnnouncements();
  const createAnn = useCreateAnnouncement();
  const deleteAnn = useDeleteAnnouncement();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [created, setCreated] = useState(false);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone size={18} className="text-primary-light" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-dim">
          Annonces in-app
        </h3>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createAnn.mutate(
            { title, body, url: url || undefined },
            {
              onSuccess: () => {
                setCreated(true);
                setTitle("");
                setBody("");
                setUrl("");
                setTimeout(() => setCreated(false), 3000);
              },
            },
          );
        }}
        className="space-y-3 rounded-xl bg-surface-low p-5"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre de l'annonce"
          required
          maxLength={100}
          className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message..."
          required
          maxLength={500}
          rows={2}
          className="w-full resize-none rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Lien (optionnel, ex: /profile)"
          className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={createAnn.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
        >
          {created ? (
            <>
              <Check size={16} />
              {"Publiée !"}
            </>
          ) : (
            <>
              <Megaphone size={16} />
              {"Publier l'annonce"}
            </>
          )}
        </button>
      </form>

      {!isPending && list && list.length > 0 && (
        <div className="max-h-60 space-y-2 overflow-auto">
          {list.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg bg-surface-low p-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-text">{a.title}</p>
                  {a.active && (
                    <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary-light">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted">{a.body}</p>
              </div>
              <button
                onClick={() => deleteAnn.mutate(a.id)}
                disabled={deleteAnn.isPending}
                className="shrink-0 rounded p-2 text-text-dim hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NotificationSection({ users }: { users?: { id: string; name: string; email: string }[] }) {
  const { data: history, isPending: historyPending } = useAdminNotifications();
  const sendNotification = useSendAdminNotification();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [sendAll, setSendAll] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendNotification.mutate(
      {
        title,
        body,
        url: url || undefined,
        userIds: sendAll ? undefined : selectedUserIds,
      },
      {
        onSuccess: (data) => {
          setSent(true);
          setTitle("");
          setBody("");
          setUrl("");
          setTimeout(() => setSent(false), 3000);
        },
      },
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-primary-light" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-dim">
          Notifications push
        </h3>
      </div>

      {/* Compose form */}
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-surface-low p-5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre de la notification"
          required
          maxLength={100}
          className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Contenu de la notification..."
          required
          maxLength={500}
          rows={3}
          className="w-full resize-none rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Lien notification (optionnel)"
          className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        {/* Target selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendAll}
              onChange={(e) => setSendAll(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm font-medium text-text">Tous les utilisateurs</span>
          </label>

          {!sendAll && users && (
            <div className="max-h-40 overflow-y-auto rounded-lg bg-surface-high p-2">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    onChange={(e) =>
                      setSelectedUserIds((prev) =>
                        e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                      )
                    }
                    className="accent-primary"
                  />
                  <span className="text-xs text-text">{u.name ?? u.email}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={sendNotification.isPending || (!sendAll && selectedUserIds.length === 0)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
        >
          {sent ? (
            <>
              <Check size={16} />
              {"Envoyé !"}
            </>
          ) : sendNotification.isPending ? (
            "Envoi..."
          ) : (
            <>
              <Send size={16} />
              Envoyer
            </>
          )}
        </button>

        {sendNotification.isError && (
          <p className="text-center text-xs text-danger">Erreur lors de l&apos;envoi.</p>
        )}
      </form>

      {/* History */}
      {!historyPending && history && history.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-text-dim">Historique</h4>
          <div className="max-h-80 space-y-2 overflow-auto">
            {history.map((n) => (
              <div key={n.id} className="rounded-lg bg-surface-low p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-text">{n.title}</p>
                    <p className="text-xs text-text-muted">{n.body}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-primary-light">
                      {n.sentCount} {"envoyés"}
                    </span>
                    {n.failedCount > 0 && (
                      <span className="ml-1 text-xs text-danger">
                        {n.failedCount} {"échecs"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-text-dim">
                  <span>{n.targetUserIds ? `${n.targetUserIds.length} utilisateurs` : "Tous"}</span>
                  <span>{"\u00b7"}</span>
                  <span>{formatDate(n.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-low p-5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest text-text-dim">{label}</span>
      </div>
      <div className="mt-2">
        {loading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-surface-high" />
        ) : (
          <span className="text-3xl font-bold text-text">{value ?? 0}</span>
        )}
      </div>
    </div>
  );
}
