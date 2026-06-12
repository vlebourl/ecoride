import { useState } from "react";
import { Check, Clock, Database, Rocket } from "lucide-react";
import type { AdminHealthData } from "@/hooks/queries";
import { formatUptime } from "@/lib/format-utils";
import { useT } from "@/i18n/provider";

type AdminSystemSectionProps = {
  health: AdminHealthData | undefined;
  healthPending: boolean;
  triggerDeployPending: boolean;
  onTriggerDeploy: (callbacks: { onSuccess: () => void; onError: () => void }) => void;
};

export function AdminSystemSection({
  health,
  healthPending,
  triggerDeployPending,
  onTriggerDeploy,
}: AdminSystemSectionProps) {
  const t = useT();
  const [deployStatus, setDeployStatus] = useState<"idle" | "success" | "error">("idle");

  const handleTriggerDeploy = () => {
    setDeployStatus("idle");
    onTriggerDeploy({
      onSuccess: () => {
        setDeployStatus("success");
        setTimeout(() => setDeployStatus("idle"), 3000);
      },
      onError: () => {
        setDeployStatus("error");
        setTimeout(() => setDeployStatus("idle"), 3000);
      },
    });
  };

  return (
    <section className="rounded-xl bg-surface-low p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          {t("admin.system.title")}
        </h2>
        <button
          onClick={handleTriggerDeploy}
          disabled={triggerDeployPending}
          className="flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-bold text-primary-light active:scale-95 disabled:opacity-50"
        >
          {triggerDeployPending ? (
            <div className="h-3 w-3 animate-spin rounded-full border border-primary-light border-t-transparent" />
          ) : deployStatus === "success" ? (
            <Check size={12} />
          ) : deployStatus === "error" ? (
            <span className="text-danger">{t("admin.system.deployErrorShort")}</span>
          ) : (
            <Rocket size={12} />
          )}
          {deployStatus === "success"
            ? t("admin.system.deployed")
            : deployStatus === "error"
              ? t("admin.system.deployError")
              : t("admin.system.deploy")}
        </button>
      </div>

      {healthPending ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : health ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-bold uppercase text-text-dim">
              {t("admin.system.version")}
            </span>
            <span className="text-sm font-bold text-text">{health.version}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Clock size={14} className="text-text-dim" />
            <span className="text-xs font-bold uppercase text-text-dim">
              {t("admin.system.uptime")}
            </span>
            <span className="text-sm font-bold text-text">{formatUptime(health.uptime)}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Database size={14} className="text-text-dim" />
            <span className="text-xs font-bold uppercase text-text-dim">
              {t("admin.system.db")}
            </span>
            <span
              className={`text-sm font-bold ${health.dbConnected ? "text-primary-light" : "text-danger"}`}
            >
              {health.dbConnected ? t("admin.system.dbOk") : t("admin.system.dbDown")}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Database size={14} className="text-text-dim" />
            <span className="text-xs font-bold uppercase text-text-dim">
              {t("admin.system.dbSize")}
            </span>
            <span className="text-sm font-bold text-text">
              {health.dbSizeMb.toFixed(1)} {t("admin.system.dbSizeUnit")}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
