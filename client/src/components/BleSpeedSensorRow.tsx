import { useCallback, useState } from "react";
import { Bluetooth, BluetoothOff } from "lucide-react";
import { useT } from "@/i18n/provider";
import { useBleSpeedSensor } from "@/hooks/useBleSpeedSensor";
import { isBleSpeedSensorSupported } from "@/lib/ble-speed-sensor";

const WHEEL_PRESETS = [
  { label: "27,5×2,4", value: 2215 },
  { label: "700×25c", value: 2096 },
  { label: "700×32c", value: 2155 },
];

/**
 * Settings row (for ProfilePage) that lets the user pair a BLE cycling speed
 * sensor (CSC standard) and configure the wheel circumference.
 * Mirrors MapCacheRow in structure.
 */
export function BleSpeedSensorRow() {
  const t = useT();
  const { state, pair, disconnect, wheelCircumferenceMm, setWheelCircumferenceMm } =
    useBleSpeedSensor();

  const [inputValue, setInputValue] = useState(String(wheelCircumferenceMm));

  const handlePair = useCallback(async () => {
    await pair();
  }, [pair]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const handleWheelInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setInputValue(raw);
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        setWheelCircumferenceMm(parsed);
      }
    },
    [setWheelCircumferenceMm],
  );

  if (!isBleSpeedSensorSupported()) {
    return (
      <div className="flex w-full flex-col gap-2 p-4">
        <div className="flex items-center gap-4">
          <BluetoothOff size={20} className="text-text-muted" />
          <span className="text-sm font-medium">{t("profile.bleSpeedSensor.row")}</span>
        </div>
        <p className="ml-9 text-xs text-text-dim">{t("vehicle.bleUnsupported.body")}</p>
      </div>
    );
  }

  const statusLabel =
    state.status === "connected"
      ? t("profile.bleSpeedSensor.statusConnected", { name: state.deviceName ?? "?" })
      : state.status === "connecting"
        ? t("profile.bleSpeedSensor.statusConnecting")
        : state.status === "error"
          ? t("profile.bleSpeedSensor.statusError")
          : t("profile.bleSpeedSensor.statusDisconnected");

  const isPairing = state.status === "connecting";
  const isConnected = state.status === "connected";

  return (
    <div className="flex w-full flex-col gap-2 p-4">
      <div className="flex items-center gap-4">
        <Bluetooth size={20} className={isConnected ? "text-primary-light" : "text-text-muted"} />
        <span className="text-sm font-medium">{t("profile.bleSpeedSensor.row")}</span>
      </div>

      <p className="ml-9 text-xs text-text-dim">{t("profile.bleSpeedSensor.description")}</p>

      <div className="ml-9 flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted">{statusLabel}</span>

        {isConnected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-surface-high px-3 py-2 text-xs font-bold text-text-muted active:scale-95"
          >
            <BluetoothOff size={14} />
            {t("profile.bleSpeedSensor.disconnect")}
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePair}
            disabled={isPairing}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-surface-high px-3 py-2 text-xs font-bold text-text-muted active:scale-95 disabled:opacity-50"
          >
            <Bluetooth size={14} />
            {isPairing ? t("profile.bleSpeedSensor.pairing") : t("profile.bleSpeedSensor.pair")}
          </button>
        )}
      </div>

      {/* Wheel circumference */}
      <div className="ml-9 mt-2 flex flex-col gap-1">
        <label className="text-xs font-medium text-text-muted">
          {t("profile.bleSpeedSensor.wheelCircumference")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={500}
            max={4000}
            value={inputValue}
            onChange={handleWheelInput}
            className="w-24 rounded-lg bg-surface-high px-3 py-2 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-1">
            {WHEEL_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  setInputValue(String(preset.value));
                  setWheelCircumferenceMm(preset.value);
                }}
                className={`rounded px-2 py-1 text-xs font-bold ${
                  wheelCircumferenceMm === preset.value
                    ? "bg-primary text-white"
                    : "bg-surface-high text-text-muted"
                } active:scale-95`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-dim">
          {t("profile.bleSpeedSensor.wheelCircumferenceHelp")}
        </p>
      </div>
    </div>
  );
}
