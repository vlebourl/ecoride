import { useState } from "react";
import { Activity } from "lucide-react";
import { useAdminAuditLogs } from "@/hooks/queries";
import { useT } from "@/i18n/provider";

export function AuditLogSection() {
  const t = useT();
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
          {t("admin.audit.title")}
        </h2>
      </div>
      <div className="mb-3 flex gap-2">
        <input
          type="text"
          placeholder={t("admin.audit.filterUserId")}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="flex-1 rounded-lg bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="text"
          placeholder={t("admin.audit.filterAction")}
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
                <th className="pb-3 pr-4">{t("admin.audit.col.action")}</th>
                <th className="pb-3 pr-4">{t("admin.audit.col.user")}</th>
                <th className="pb-3 text-right">{t("admin.audit.col.date")}</th>
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
        <p className="py-4 text-center text-sm text-text-muted">{t("admin.audit.empty")}</p>
      )}
    </section>
  );
}
