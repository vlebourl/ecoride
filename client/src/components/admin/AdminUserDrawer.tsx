import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { AdminStatsUser } from "@/hooks/queries";
import { formatDate } from "@/lib/format-utils";
import { useT } from "@/i18n/provider";

type AdminUserDrawerProps = {
  selectedUser: AdminStatsUser | null;
  currentUserId?: string;
  userActionBusy: boolean;
  onClose: () => void;
  onGrantAdmin: (user: AdminStatsUser) => void;
  onRevokeAdmin: (user: AdminStatsUser) => void;
  onGrantSuper73Access: (user: AdminStatsUser) => void;
  onRevokeSuper73Access: (user: AdminStatsUser) => void;
  onDeleteUser: (user: AdminStatsUser) => void;
};

export function AdminUserDrawer({
  selectedUser,
  currentUserId,
  userActionBusy,
  onClose,
  onGrantAdmin,
  onRevokeAdmin,
  onGrantSuper73Access,
  onRevokeSuper73Access,
  onDeleteUser,
}: AdminUserDrawerProps) {
  const t = useT();

  if (!selectedUser) {
    return null;
  }

  const isCurrentUser = selectedUser.id === currentUserId;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 sm:items-stretch">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("admin.userPanel.dialogAria", { name: selectedUser.name })}
        className="relative flex max-h-[85vh] w-full animate-[slideUp_0.2s_ease-out] flex-col overflow-hidden rounded-t-2xl bg-surface-container p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-2xl"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-text-dim">
              {t("admin.userPanel.userLabel")}
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-text">
              {selectedUser.name}
            </h2>
            <p className="mt-1 text-sm text-text-muted">{selectedUser.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-dim transition-colors hover:bg-surface-high hover:text-text"
            aria-label={t("admin.userPanel.closeAria")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto">
          <section className="rounded-xl bg-surface-low p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              {t("admin.userPanel.summary")}
            </h3>
            <div className="mt-3 space-y-2 text-sm text-text-muted">
              <div className="flex items-center justify-between">
                <span>{t("admin.userPanel.trips")}</span>
                <span className="font-bold text-text">{selectedUser.tripCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("admin.userPanel.totalCo2")}</span>
                <span className="font-bold text-text">
                  {selectedUser.totalCo2.toFixed(1)} {t("admin.userPanel.co2Unit")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("admin.userPanel.signedUp")}</span>
                <span className="font-bold text-text">{formatDate(selectedUser.createdAt)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-surface-low p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
              {t("admin.userPanel.actions")}
            </h3>
            <div className="mt-3 grid gap-3">
              <button
                type="button"
                disabled={userActionBusy}
                onClick={() =>
                  selectedUser.isAdmin ? onRevokeAdmin(selectedUser) : onGrantAdmin(selectedUser)
                }
                className={`rounded-xl px-4 py-3 text-left text-sm font-bold transition-colors disabled:opacity-50 ${
                  selectedUser.isAdmin
                    ? "bg-danger/15 text-danger"
                    : "bg-primary/20 text-primary-light"
                }`}
              >
                {selectedUser.isAdmin
                  ? t("admin.userPanel.revokeAdmin")
                  : t("admin.userPanel.grantAdmin")}
              </button>
              <button
                type="button"
                disabled={userActionBusy}
                onClick={() =>
                  selectedUser.super73Enabled
                    ? onRevokeSuper73Access(selectedUser)
                    : onGrantSuper73Access(selectedUser)
                }
                className={`rounded-xl px-4 py-3 text-left text-sm font-bold transition-colors disabled:opacity-50 ${
                  selectedUser.super73Enabled
                    ? "bg-surface-high text-text"
                    : "bg-sky-500/20 text-sky-300"
                }`}
              >
                {selectedUser.super73Enabled
                  ? t("admin.userPanel.revokeS73")
                  : t("admin.userPanel.grantS73")}
              </button>
              <button
                type="button"
                disabled={userActionBusy || isCurrentUser}
                onClick={() => {
                  if (
                    !window.confirm(
                      t("admin.userPanel.deleteConfirm", { email: selectedUser.email }),
                    )
                  ) {
                    return;
                  }
                  onDeleteUser(selectedUser);
                }}
                className="rounded-xl bg-danger/15 px-4 py-3 text-left text-sm font-bold text-danger transition-colors disabled:opacity-50"
              >
                {t("admin.userPanel.deleteUser")}
              </button>
              {isCurrentUser && (
                <p className="text-xs text-text-dim">{t("admin.userPanel.selfWarning")}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
