import { Lightbulb, LightbulbOff } from "lucide-react";
import { useT } from "@/i18n/provider";

interface HeadlightIndicatorProps {
  /** Headlight state from the bike (BLE `light` bit), or null when unknown (component hides). */
  on: boolean | null;
}

/**
 * Compact headlight on/off status for the trip screen, fed by the already-decoded
 * `Super73State.light` BLE bit. Grouped with the battery indicator in the page
 * header so all bike telemetry status sits together. Read-only.
 */
export function HeadlightIndicator({ on }: HeadlightIndicatorProps) {
  const t = useT();
  if (on == null) return null;

  const label = on ? t("super73.compact.lightOn") : t("super73.compact.lightOff");

  return (
    <span
      data-testid="headlight-indicator"
      data-state={on ? "on" : "off"}
      role="img"
      aria-label={label}
      className={`flex items-center rounded-md px-2 py-0.5 ${
        on ? "bg-warning/20 text-warning" : "bg-surface-low/80 text-text-dim"
      }`}
    >
      {on ? <Lightbulb size={16} aria-hidden /> : <LightbulbOff size={16} aria-hidden />}
    </span>
  );
}
