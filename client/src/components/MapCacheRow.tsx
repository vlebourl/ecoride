import { useCallback, useEffect, useState } from "react";
import { Map as MapIcon, Trash2 } from "lucide-react";
import { useT } from "@/i18n/provider";
import { clearTileCache, formatBytes, getTileCacheInfo } from "@/lib/tile-cache";

/**
 * Settings row (for ProfilePage) that shows the offline map tile cache size
 * and lets the user clear it. Loads the stats on mount and refreshes after
 * clearing.
 */
export function MapCacheRow() {
  const t = useT();
  const [entries, setEntries] = useState(0);
  const [approxBytes, setApproxBytes] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [justCleared, setJustCleared] = useState(false);

  const refresh = useCallback(async () => {
    const info = await getTileCacheInfo();
    setEntries(info.entries);
    setApproxBytes(info.approxBytes);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleClear = useCallback(async () => {
    if (!window.confirm(t("profile.mapCache.clearConfirm"))) return;
    setClearing(true);
    try {
      await clearTileCache();
      await refresh();
      setJustCleared(true);
      setTimeout(() => setJustCleared(false), 2000);
    } finally {
      setClearing(false);
    }
  }, [refresh, t]);

  const entriesLabel =
    entries === 0
      ? t("profile.mapCache.empty")
      : entries === 1
        ? t("profile.mapCache.entriesOne", { count: entries })
        : t("profile.mapCache.entriesMany", { count: entries });

  return (
    <div className="flex w-full flex-col gap-2 p-4">
      <div className="flex items-center gap-4">
        <MapIcon size={20} className="text-text-muted" />
        <span className="text-sm font-medium">{t("profile.mapCache.row")}</span>
      </div>
      <p className="ml-9 text-xs text-text-dim">{t("profile.mapCache.description")}</p>
      <div className="ml-9 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-text-muted">
          <div>{entriesLabel}</div>
          {approxBytes !== null && approxBytes > 0 && (
            <div className="text-text-dim">
              {t("profile.mapCache.approxSize", { size: formatBytes(approxBytes) })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          disabled={clearing || entries === 0}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-surface-high px-3 py-2 text-xs font-bold text-text-muted active:scale-95 disabled:opacity-50"
        >
          <Trash2 size={14} />
          {justCleared
            ? t("profile.mapCache.cleared")
            : clearing
              ? t("profile.mapCache.clearing")
              : t("profile.mapCache.clear")}
        </button>
      </div>
    </div>
  );
}
