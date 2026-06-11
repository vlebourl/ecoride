interface LevelStackProps {
  /** Active level, 0–4. Values outside the range are clamped. */
  level: number;
  /** Tailwind background class applied to filled cells (e.g. "bg-primary"). */
  activeColor: string;
  /** Short uppercase label shown above the stack. */
  label: string;
  /** Accessible description of the whole stack. */
  ariaLabel: string;
}

const CELLS = [4, 3, 2, 1] as const;

export function LevelStack({ level, activeColor, label, ariaLabel }: LevelStackProps) {
  const clamped = Math.min(Math.max(level, 0), 4);
  return (
    <div className="flex flex-col items-center gap-1.5" role="img" aria-label={ariaLabel}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-dim">{label}</span>
      <div className="flex flex-col gap-1">
        {CELLS.map((n) => {
          const filled = clamped >= n;
          return (
            <div
              key={n}
              data-filled={filled}
              aria-hidden
              className={`flex h-7 w-9 items-center justify-center rounded-md text-xs font-bold ${
                filled ? `${activeColor} text-white` : "bg-surface-low/80 text-text-dim"
              }`}
            >
              {n}
            </div>
          );
        })}
      </div>
    </div>
  );
}
