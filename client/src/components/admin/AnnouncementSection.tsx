import { useState } from "react";
import { Check, Megaphone, Trash2 } from "lucide-react";
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
} from "@/hooks/queries";
import { useT } from "@/i18n/provider";

export function AnnouncementSection() {
  const t = useT();
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
          {t("admin.announcements.title")}
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
          placeholder={t("admin.announcements.titlePlaceholder")}
          required
          maxLength={100}
          className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("admin.announcements.bodyPlaceholder")}
          required
          maxLength={500}
          rows={2}
          className="w-full resize-none rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("admin.announcements.urlPlaceholder")}
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
              {t("admin.announcements.published")}
            </>
          ) : (
            <>
              <Megaphone size={16} />
              {t("admin.announcements.publish")}
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
                      {t("admin.announcements.active")}
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
