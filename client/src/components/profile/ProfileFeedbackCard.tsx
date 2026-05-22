import { Check, ChevronDown, ChevronRight, MessageSquarePlus } from "lucide-react";
import { useT } from "@/i18n/provider";

interface ProfileFeedbackCardProps {
  open: boolean;
  feedbackType: "bug" | "feature";
  feedbackTitle: string;
  feedbackDescription: string;
  feedbackSent: boolean;
  pending: boolean;
  isError: boolean;
  onToggle: () => void;
  onFeedbackTypeChange: (value: "bug" | "feature") => void;
  onFeedbackTitleChange: (value: string) => void;
  onFeedbackDescriptionChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function ProfileFeedbackCard({
  open,
  feedbackType,
  feedbackTitle,
  feedbackDescription,
  feedbackSent,
  pending,
  isError,
  onToggle,
  onFeedbackTypeChange,
  onFeedbackTitleChange,
  onFeedbackDescriptionChange,
  onSubmit,
}: ProfileFeedbackCardProps) {
  const t = useT();

  return (
    <div className="overflow-hidden rounded-lg bg-surface-low">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-surface-high"
      >
        <div className="flex items-center gap-4">
          <MessageSquarePlus size={20} className="text-text-muted" />
          <span className="text-sm font-medium">{t("profile.feedback.title")}</span>
        </div>
        {open ? (
          <ChevronDown size={18} className="text-text-dim" />
        ) : (
          <ChevronRight size={18} className="text-text-dim" />
        )}
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {feedbackSent ? (
            <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-4">
              <Check size={18} className="text-primary-light" />
              <span className="text-sm font-medium text-primary-light">
                {t("profile.feedback.thanks")}
              </span>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="flex gap-2">
                {(["bug", "feature"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onFeedbackTypeChange(type)}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                      feedbackType === type
                        ? "bg-primary/20 text-primary-light"
                        : "bg-surface-high text-text-muted"
                    }`}
                  >
                    {type === "bug" ? t("profile.feedback.bug") : t("profile.feedback.feature")}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={feedbackTitle}
                onChange={(event) => onFeedbackTitleChange(event.target.value)}
                placeholder={t("profile.feedback.titlePlaceholder")}
                required
                minLength={3}
                maxLength={200}
                className="w-full rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <textarea
                value={feedbackDescription}
                onChange={(event) => onFeedbackDescriptionChange(event.target.value)}
                placeholder={t("profile.feedback.descPlaceholder")}
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                className="w-full resize-none rounded-lg bg-surface-high p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-bg active:scale-95 disabled:opacity-50"
              >
                {pending ? t("profile.feedback.sending") : t("profile.feedback.send")}
              </button>
              {isError && (
                <p className="text-center text-xs text-danger">{t("profile.feedback.error")}</p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
