import { AlertTriangle } from "lucide-react";

/** Shown in place of a map when the browser cannot initialise a WebGL context. */
export function MapNoWebGL() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-low text-text-dim"
      data-no-swipe
    >
      <AlertTriangle size={24} className="opacity-60" />
      <span className="text-sm font-medium">Carte indisponible</span>
      <span className="text-xs opacity-50">WebGL non supporté par ce navigateur</span>
    </div>
  );
}
