import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: string;
  unit: string;
}

export function StatCard({ icon: Icon, value, unit }: StatCardProps) {
  return (
    <div className="flex aspect-square flex-col justify-between rounded-xl bg-surface-container p-4">
      <Icon size={20} className="text-primary-light" strokeWidth={1.8} />
      <div>
        <div className="text-lg font-black leading-none tracking-tight">
          {value}
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {unit}
        </div>
      </div>
    </div>
  );
}
