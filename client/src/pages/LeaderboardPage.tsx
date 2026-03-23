import { useState } from "react";
import { Trophy } from "lucide-react";
import { useLeaderboard } from "@/hooks/queries";
import { useSession } from "@/lib/auth";
import type { StatsPeriod } from "@ecoride/shared/api-contracts";

const periodOptions = [
  { label: "Semaine", value: "week" as StatsPeriod },
  { label: "Mois", value: "month" as StatsPeriod },
  { label: "Tout", value: "all" as StatsPeriod },
];

const periodSubtitles: Record<string, string> = {
  week: "L'impact écologique cette semaine",
  month: "L'impact écologique ce mois-ci",
  all: "L'impact écologique global",
};

export function LeaderboardPage() {
  const { data: session } = useSession();
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const { data, isPending } = useLeaderboard(period);

  if (isPending || !data) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status" aria-label="Chargement">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const currentUserId = session?.user?.id;
  const { entries } = data;
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <>
      {/* Header */}
      <header role="banner" className="sticky top-0 z-40 flex items-center justify-between bg-bg/80 px-6 py-4 backdrop-blur-xl">
        <span className="text-lg font-bold tracking-tight">
          <span className="text-text">eco</span><span className="text-primary-light">Ride</span>
        </span>
      </header>

      <div className="px-6 pb-6">
        {/* Title */}
        <section className="mb-10">
          <h2 className="mb-2 text-4xl font-extrabold tracking-tighter">
            Classement
          </h2>
          <p className="text-sm font-medium text-text-dim">
            {periodSubtitles[period]}
          </p>

          {/* Period switcher */}
          <div className="mt-4 flex gap-2" data-testid="period-switcher">
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`rounded-lg px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  opt.value === period
                    ? "bg-primary/20 text-primary-light"
                    : "bg-surface-high text-text-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Trophy size={40} className="text-primary-light" />
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <h3 className="text-xl font-bold">Pas encore de classement</h3>
              <p className="max-w-xs text-sm text-text-muted">
                Enregistrez des trajets pour apparaître ici.
              </p>
            </div>
          </div>
        ) : (
        <>
        {/* Podium */}
        <section className="mb-12 grid grid-cols-3 items-end gap-4">
          {/* Rank 2 */}
          {top3[1] && (
            <div className="flex flex-col items-center">
              <div className="relative mb-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-text-dim bg-surface-high">
                  <span className="text-2xl font-bold text-text-muted">
                    {top3[1].name.charAt(0)}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-high text-xs font-bold text-text">
                  2
                </div>
              </div>
              <span className="w-full truncate text-center text-xs font-bold">
                {top3[1].name}
              </span>
              <span className="mt-1 text-xs font-black uppercase tracking-widest text-primary-light">
                {top3[1].totalCo2SavedKg} KG
              </span>
            </div>
          )}

          {/* Rank 1 */}
          {top3[0] && (
            <div className="flex flex-col items-center">
              <div className="relative mb-4 scale-125">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-primary shadow-[0_0_30px_rgba(84,233,138,0.3)] bg-surface-high">
                  <span className="text-3xl font-bold text-primary-light">
                    {top3[0].name.charAt(0)}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary text-xs font-black text-bg">
                  1
                </div>
              </div>
              <span className="mt-4 text-sm font-bold text-text">
                {top3[0].name}
              </span>
              <span className="mt-1 text-xs font-black uppercase tracking-widest text-primary-light">
                {top3[0].totalCo2SavedKg} KG
              </span>
            </div>
          )}

          {/* Rank 3 */}
          {top3[2] && (
            <div className="flex flex-col items-center">
              <div className="relative mb-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-surface-highest bg-surface-high">
                  <span className="text-2xl font-bold text-text-muted">
                    {top3[2].name.charAt(0)}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-highest text-xs font-bold text-text-muted">
                  3
                </div>
              </div>
              <span className="w-full truncate text-center text-xs font-bold">
                {top3[2].name}
              </span>
              <span className="mt-1 text-xs font-black uppercase tracking-widest text-primary-light">
                {top3[2].totalCo2SavedKg} KG
              </span>
            </div>
          )}
        </section>

        {/* Leaderboard List */}
        <div className="space-y-3">
          {rest.map((entry) => {
            const isMe = entry.userId === currentUserId;
            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-4 rounded-xl p-4 ${
                  isMe
                    ? "border-2 border-primary bg-surface-low shadow-[0_10px_30px_rgba(46,204,113,0.1)]"
                    : "bg-surface-low hover:bg-surface-container"
                } transition-colors`}
              >
                <span
                  className={`w-6 text-sm font-black ${
                    isMe ? "text-primary-light" : "text-text-dim"
                  }`}
                >
                  {String(entry.rank).padStart(2, "0")}
                </span>
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-surface-high">
                  <span className="text-lg font-bold text-text-muted">
                    {entry.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold">
                      {isMe ? "Vous" : entry.name}
                    </h4>
                    {isMe && (
                      <span className="rounded bg-primary/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-light">
                        Moi
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-sm font-black text-text">
                    {entry.totalCo2SavedKg} kg
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-tighter text-text-dim">
                    CO₂ Économisé
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        </>
        )}
      </div>
    </>
  );
}
