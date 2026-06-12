import type { FuelType } from "@ecoride/shared/types";
import { Check } from "lucide-react";
import { FUEL_TYPES } from "@ecoride/shared/types";
import { useT } from "@/i18n/provider";

interface ProfileVehicleEditorCardProps {
  open: boolean;
  vehicleModel: string;
  fuelType: FuelType;
  consumption: string;
  saveSuccess: boolean;
  saving: boolean;
  onVehicleModelChange: (value: string) => void;
  onFuelTypeChange: (value: FuelType) => void;
  onConsumptionChange: (value: string) => void;
  onSave: () => void;
}

export function ProfileVehicleEditorCard({
  open,
  vehicleModel,
  fuelType,
  consumption,
  saveSuccess,
  saving,
  onVehicleModelChange,
  onFuelTypeChange,
  onConsumptionChange,
  onSave,
}: ProfileVehicleEditorCardProps) {
  const t = useT();

  if (!open) return null;

  return (
    <section className="space-y-4 rounded-xl bg-surface-low p-6">
      <h2 className="text-lg font-bold tracking-tight">{t("profile.vehicle.title")}</h2>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
            {t("profile.vehicle.model")}
          </label>
          <input
            type="text"
            value={vehicleModel}
            onChange={(event) => onVehicleModelChange(event.target.value)}
            className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
            {t("profile.vehicle.fuel")}
          </label>
          <select
            value={fuelType}
            onChange={(event) => onFuelTypeChange(event.target.value as FuelType)}
            className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {FUEL_TYPES.map((fuel) => (
              <option key={fuel} value={fuel}>
                {fuel.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">
            {t("profile.vehicle.consumption")}
          </label>
          <input
            type="number"
            value={consumption}
            onChange={(event) => onConsumptionChange(event.target.value)}
            className="w-full rounded-lg bg-surface-high p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
      <button
        onClick={onSave}
        disabled={saving || saveSuccess}
        className={`w-full rounded-xl py-3 text-sm font-black uppercase tracking-widest active:scale-95 disabled:opacity-50 ${
          saveSuccess ? "bg-green-600 text-white" : "bg-primary text-bg"
        }`}
      >
        {saveSuccess ? (
          <span className="flex items-center justify-center gap-2">
            <Check size={16} /> {t("profile.vehicle.saved")}
          </span>
        ) : saving ? (
          t("profile.vehicle.saving")
        ) : (
          t("profile.vehicle.save")
        )}
      </button>
    </section>
  );
}
