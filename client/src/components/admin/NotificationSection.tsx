import { useState } from "react";
import { Bell, Check, Send } from "lucide-react";
import { useAdminNotifications, useSendAdminNotification } from "@/hooks/queries";
import { formatDate } from "@/lib/format-utils";
import { useT } from "@/i18n/provider";

export function NotificationSection({
  users,
}: {
  users?: { id: string; name: string; email: string }[];
}) {
  const t = useT();
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
        onSuccess: () => {
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
          {t("admin.notifications.title")}
        </h3>
      </div>

      {/* Compose form */}
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-surface-low p-5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("admin.notifications.titlePlaceholder")}
          required
          maxLength={100}
          className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("admin.notifications.bodyPlaceholder")}
          required
          maxLength={500}
          rows={3}
          className="w-full resize-none rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("admin.notifications.urlPlaceholder")}
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
            <span className="text-sm font-medium text-text">
              {t("admin.notifications.allUsers")}
            </span>
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
              {t("admin.notifications.sent")}
            </>
          ) : sendNotification.isPending ? (
            t("admin.notifications.sending")
          ) : (
            <>
              <Send size={16} />
              {t("admin.notifications.send")}
            </>
          )}
        </button>

        {sendNotification.isError && (
          <p className="text-center text-xs text-danger">{t("admin.notifications.error")}</p>
        )}
      </form>

      {/* History */}
      {!historyPending && history && history.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-text-dim">
            {t("admin.notifications.history")}
          </h4>
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
                      {n.sentCount} {t("admin.notifications.sentCount")}
                    </span>
                    {n.failedCount > 0 && (
                      <span className="ml-1 text-xs text-danger">
                        {n.failedCount} {t("admin.notifications.failedCount")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-text-dim">
                  <span>
                    {n.targetUserIds
                      ? t("admin.notifications.targetUsers", { count: n.targetUserIds.length })
                      : t("admin.notifications.targetAll")}
                  </span>
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
