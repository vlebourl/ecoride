import { Lightbulb, LightbulbOff } from "lucide-react";
import { useT } from "@/i18n/provider";
import { useSuper73 } from "@/hooks/useSuper73";

/**
 * Headlight on/off control for the trip screen, fed by the already-decoded
 * `Super73State.light` BLE bit. Grouped with the battery indicator in the page
 * header so all bike telemetry sits together.
 *
 * It holds no local state: what it renders is always the light bit the bike
 * last reported, so a write the bike refuses shows up as the icon staying put
 * instead of the UI sitting on an optimistic value.
 */
export function HeadlightIndicator() {
  const t = useT();
  const { status, bikeState, setLight } = useSuper73();

  // Unknown bike state: hide, same as the sibling BatteryIndicator.
  if (!bikeState) return null;

  const on = bikeState.light;
  const connected = status === "connected";

  return (
    <button
      type="button"
      data-testid="headlight-indicator"
      data-state={on ? "on" : "off"}
      aria-pressed={on}
      aria-label={on ? t("super73.headlight.turnOff") : t("super73.headlight.turnOn")}
      disabled={!connected}
      onClick={() => void setLight(!on)}
      className={`flex items-center rounded-md px-2 py-0.5 active:scale-95 disabled:opacity-50 ${
        on ? "bg-warning/20 text-warning" : "bg-surface-low/80 text-text-dim"
      }`}
    >
      {on ? <Lightbulb size={16} aria-hidden /> : <LightbulbOff size={16} aria-hidden />}
    </button>
  );
}
