import { Play, Square, X } from "lucide-react";
import { useT } from "@/i18n/provider";

export interface InterruptMenuProps {
  onResume: () => void;
  onStop: () => void;
  onAbandon: () => void;
  onClose: () => void;
  canStop: boolean;
}

export function InterruptMenu({
  onResume,
  onStop,
  onAbandon,
  onClose,
  canStop,
}: InterruptMenuProps) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 px-6 pb-6" data-no-swipe>
      <div
        className="w-full rounded-3xl border border-surface-highest bg-surface p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        role="dialog"
        aria-label={t("trip.interrupt.dialogAria")}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-text-dim">
              {t("trip.interrupt.title")}
            </p>
            <p className="mt-1 text-sm text-text-muted">{t("trip.interrupt.subtitle")}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-text-muted active:scale-95"
            aria-label={t("trip.interrupt.closeAria")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={onResume}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 text-base font-black uppercase tracking-widest text-bg active:scale-95"
          >
            <Play size={20} fill="currentColor" />
            {t("trip.interrupt.resume")}
          </button>
          <button
            onClick={onStop}
            disabled={!canStop}
            title={canStop ? undefined : t("trip.interrupt.tooShort")}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-surface-high py-4 text-base font-bold text-text active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Square size={18} fill="currentColor" />
            {t("trip.interrupt.finish")}
          </button>
          <button
            onClick={onAbandon}
            className="flex w-full items-center justify-center rounded-2xl bg-danger/10 py-4 text-base font-bold text-danger active:scale-95"
          >
            {t("trip.interrupt.abandon")}
          </button>
        </div>
      </div>
    </div>
  );
}
