import { IMPACT_REFERENCES } from "@ecoride/shared/types";

interface ImpactMeterProps {
  co2TotalKg: number;
}

export function ImpactMeter({ co2TotalKg }: ImpactMeterProps) {
  // Find current milestone
  const current = IMPACT_REFERENCES.find((r) => co2TotalKg < r.co2Kg);
  const target = current ?? IMPACT_REFERENCES[IMPACT_REFERENCES.length - 1]!;
  const prevIdx = IMPACT_REFERENCES.indexOf(target) - 1;
  const prevCo2 = prevIdx >= 0 ? IMPACT_REFERENCES[prevIdx]!.co2Kg : 0;
  const progress = Math.min(((co2TotalKg - prevCo2) / (target.co2Kg - prevCo2)) * 100, 100);

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  const emoji =
    target.co2Kg <= 21 ? "🌳" : target.co2Kg <= 45 ? "🚗" : target.co2Kg <= 115 ? "⛽" : "✈️";

  return (
    <div className="flex flex-col items-center gap-6 rounded-xl bg-surface-container p-8">
      <div className="relative flex h-48 w-48 items-center justify-center">
        <svg className="-rotate-90 h-full w-full" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="8"
            className="text-surface-highest"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-primary-light ring-transition"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-black tracking-tighter">
            {co2TotalKg.toFixed(1)} / {target.co2Kg}
          </span>
          <span className="mt-1 text-xs font-bold uppercase tracking-widest text-text-muted">
            kg CO₂
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-full border border-outline-variant/10 bg-surface-low px-5 py-3">
        <span className="text-lg">{emoji}</span>
        <span className="text-xs font-bold tracking-tight text-text">
          Prochain objectif: {target.label}
        </span>
      </div>
    </div>
  );
}
