import { Pause } from "lucide-react";
import { Super73ModeButton } from "@/components/Super73ModeButton";

export interface TrackingControlsProps {
  isPaused: boolean;
  onInterrupt: () => void;
  super73Enabled?: boolean;
}

export function TrackingControls({ isPaused, onInterrupt, super73Enabled }: TrackingControlsProps) {
  return (
    <div className="flex gap-3 px-6 py-6">
      {super73Enabled && <Super73ModeButton enabled compact />}
      <button
        onClick={onInterrupt}
        className={`flex flex-1 items-center justify-center gap-4 rounded-xl py-6 shadow-[0px_20px_40px_rgba(0,0,0,0.4)] active:scale-95 ${
          isPaused ? "bg-warning/20" : "bg-danger"
        }`}
        aria-label={isPaused ? "Ouvrir le menu d'interruption" : "Interrompre le trajet"}
      >
        <Pause size={28} className={isPaused ? "text-warning" : "text-text"} fill="currentColor" />
        <span
          className={`text-xl font-black uppercase tracking-widest ${
            isPaused ? "text-warning" : "text-text"
          }`}
        >
          {isPaused ? "Interrompu" : "Interrompre"}
        </span>
      </button>
    </div>
  );
}
