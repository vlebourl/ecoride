function formatWithTimezone(
  value: Date | string,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string | null,
): string {
  return new Intl.DateTimeFormat("fr-FR", {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDate(iso: string, timeZone?: string | null): string {
  return formatWithTimezone(
    iso,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
    timeZone,
  );
}

export function formatMonthYear(date: Date, timeZone?: string | null): string {
  return formatWithTimezone(date, { month: "long", year: "numeric" }, timeZone);
}

export function formatDayMonth(iso: string, timeZone?: string | null): string {
  return formatWithTimezone(
    iso,
    {
      day: "numeric",
      month: "short",
    },
    timeZone,
  );
}

export function formatLongDate(iso: string, timeZone?: string | null): string {
  return formatWithTimezone(
    iso,
    {
      weekday: "long",
      day: "numeric",
      month: "long",
    },
    timeZone,
  );
}

export function formatFullDate(iso: string, timeZone?: string | null): string {
  return formatWithTimezone(
    iso,
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
    timeZone,
  );
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m}min`;
}

/** Format seconds as MM:SS (used by trip tracking timer). */
export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
