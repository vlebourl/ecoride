type Period = "day" | "week" | "month";

const labels: Record<Period, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
};

interface PeriodSwitcherProps {
  value: Period;
  onChange: (p: Period) => void;
}

export function PeriodSwitcher({ value, onChange }: PeriodSwitcherProps) {
  return (
    <nav className="flex items-center border-b border-surface-low">
      {(Object.keys(labels) as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            p === value
              ? "font-bold text-primary-light border-b-2 border-primary-light"
              : "text-text-muted hover:text-text"
          }`}
        >
          {labels[p]}
        </button>
      ))}
    </nav>
  );
}
