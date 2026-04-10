import { AlertTriangle } from "lucide-react";
import { useT } from "@/i18n/provider";

/** Shown in place of a map when the browser cannot initialise a WebGL context. */
export function MapNoWebGL() {
  const t = useT();
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-low text-text-dim"
      data-no-swipe
    >
      <AlertTriangle size={24} className="opacity-60" />
      <span className="text-sm font-medium">{t("shared.mapNoWebGL.title")}</span>
      <span className="text-xs opacity-50">{t("shared.mapNoWebGL.body")}</span>
    </div>
  );
}
