const DEFAULT_TIMEZONE = "UTC";

export function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(value?: string | null): string {
  if (!value) return DEFAULT_TIMEZONE;
  return isValidIanaTimezone(value) ? value : DEFAULT_TIMEZONE;
}

export { DEFAULT_TIMEZONE };
