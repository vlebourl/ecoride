import { Download, LogOut, Shield, Trash2, Upload, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { useT } from "@/i18n/provider";

interface ProfileActionsSectionProps {
  isAdmin: boolean;
  onLogout: () => void;
  onExport: () => void;
  onImportClick: () => void;
  onDeleteAccount: () => void;
  exportPending: boolean;
  importPending: boolean;
  deletePending: boolean;
}

export function ProfileActionsSection({
  isAdmin,
  onLogout,
  onExport,
  onImportClick,
  onDeleteAccount,
  exportPending,
  importPending,
  deletePending,
}: ProfileActionsSectionProps) {
  const t = useT();

  return (
    <section className="space-y-4">
      {isAdmin && (
        <Link
          to="/admin"
          className="flex w-full items-center justify-between rounded-lg bg-surface-high p-4 transition-colors hover:bg-surface-low"
        >
          <div className="flex items-center gap-4">
            <Shield size={20} className="text-primary-light" />
            <span className="text-sm font-medium">{t("profile.admin")}</span>
          </div>
          <ChevronRight size={18} className="text-text-dim" />
        </Link>
      )}

      <button
        onClick={onLogout}
        className="w-full rounded-lg bg-surface-high py-4 text-xs font-bold uppercase tracking-widest text-danger active:scale-95"
      >
        <div className="flex items-center justify-center gap-2">
          <LogOut size={16} />
          {t("profile.logout")}
        </div>
      </button>

      <button
        onClick={onExport}
        disabled={exportPending}
        className="w-full rounded-lg bg-surface-high py-4 text-xs font-bold uppercase tracking-widest text-text-muted active:scale-95 disabled:opacity-50"
      >
        <div className="flex items-center justify-center gap-2">
          <Download size={16} />
          {exportPending ? t("profile.export.exporting") : t("profile.export.label")}
        </div>
      </button>

      <button
        onClick={onImportClick}
        disabled={importPending}
        className="w-full rounded-lg bg-surface-high py-4 text-xs font-bold uppercase tracking-widest text-text-muted active:scale-95 disabled:opacity-50"
      >
        <div className="flex items-center justify-center gap-2">
          <Upload size={16} />
          {importPending ? t("profile.import.importing") : t("profile.import.label")}
        </div>
      </button>

      <button
        onClick={onDeleteAccount}
        disabled={deletePending}
        className="w-full rounded-lg border border-red-500/30 bg-red-500/10 py-4 text-xs font-bold uppercase tracking-widest text-red-400 active:scale-95 disabled:opacity-50"
      >
        <div className="flex items-center justify-center gap-2">
          <Trash2 size={16} />
          {deletePending ? t("profile.delete.deleting") : t("profile.delete.label")}
        </div>
      </button>
    </section>
  );
}
