export function AdminStatCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-low p-5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest text-text-dim">{label}</span>
      </div>
      <div className="mt-2">
        {loading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-surface-high" />
        ) : (
          <span className="text-3xl font-bold text-text">{value ?? 0}</span>
        )}
      </div>
    </div>
  );
}
