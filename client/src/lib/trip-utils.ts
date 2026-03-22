export function tripLabel(startedAt: string): string {
  const hour = new Date(startedAt).getHours();
  if (hour < 6) return "Trajet de nuit";
  if (hour < 10) return "Trajet du matin";
  if (hour < 14) return "Trajet du midi";
  if (hour < 18) return "Trajet de l'après-midi";
  if (hour < 21) return "Trajet du soir";
  return "Trajet de nuit";
}
