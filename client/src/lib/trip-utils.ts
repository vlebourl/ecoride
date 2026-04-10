import type { TranslationKey } from "@/i18n/locales/fr";

/**
 * Returns the i18n translation key for the time-of-day label of a trip.
 * Callers should pass the key through `t()` to get the localized string.
 */
export function tripLabelKey(startedAt: string): TranslationKey {
  const hour = new Date(startedAt).getHours();
  if (hour < 6) return "stats.tripLabel.night";
  if (hour < 10) return "stats.tripLabel.morning";
  if (hour < 14) return "stats.tripLabel.noon";
  if (hour < 18) return "stats.tripLabel.afternoon";
  if (hour < 21) return "stats.tripLabel.evening";
  return "stats.tripLabel.night";
}

/**
 * Legacy French-only label kept for backward compatibility with any non-i18n
 * callers. Prefer `tripLabelKey` + `t()` in new code.
 */
export function tripLabel(startedAt: string): string {
  const hour = new Date(startedAt).getHours();
  if (hour < 6) return "Trajet de nuit";
  if (hour < 10) return "Trajet du matin";
  if (hour < 14) return "Trajet du midi";
  if (hour < 18) return "Trajet de l'après-midi";
  if (hour < 21) return "Trajet du soir";
  return "Trajet de nuit";
}
