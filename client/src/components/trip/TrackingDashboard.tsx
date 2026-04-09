export interface TrackingDashboardProps {
  isPaused: boolean;
  speedKmh: number | null;
  distance: number;
  co2Saved: number;
  elapsed: number;
  formatTime: (s: number) => string;
}

export function TrackingDashboard({
  isPaused,
  speedKmh,
  distance,
  co2Saved,
  elapsed,
  formatTime,
}: TrackingDashboardProps) {
  return (
    <>
      {/* Speed — hero central */}
      <div className="flex flex-col items-center py-6">
        {isPaused ? (
          <span
            className="text-5xl font-black tracking-tighter text-warning"
            aria-label="Trajet en pause"
          >
            PAUSÉ
          </span>
        ) : (
          <span className="text-7xl font-black tracking-tighter text-text">
            {speedKmh != null ? speedKmh.toFixed(0) : "—"}
          </span>
        )}
        <span className="text-sm font-bold uppercase tracking-widest text-text-dim">
          {isPaused ? "en pause" : "km/h"}
        </span>
      </div>

      {/* Distance / CO₂ / Temps — row */}
      <div className="grid grid-cols-3 gap-3 px-6 pb-4">
        <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
          <span className="block text-2xl font-extrabold tracking-tighter text-text">
            {distance.toFixed(1)}
          </span>
          <span className="text-xs font-bold uppercase text-text-dim">km</span>
        </div>
        <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
          <span className="block text-2xl font-extrabold tracking-tighter text-primary-light">
            {co2Saved.toFixed(1)}
          </span>
          <span className="text-xs font-bold uppercase text-text-dim">kg CO₂</span>
        </div>
        <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
          <span className="block text-2xl font-extrabold tracking-tighter text-text">
            {formatTime(elapsed)}
          </span>
          <span className="text-xs font-bold uppercase text-text-dim">temps</span>
        </div>
      </div>
    </>
  );
}
