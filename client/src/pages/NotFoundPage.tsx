import { Link } from "react-router";
import { Bike } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15">
        <Bike size={40} className="text-primary-light" />
      </div>

      <p className="mt-8 text-8xl font-black tracking-tighter text-text-muted">404</p>

      <h1 className="mt-4 text-2xl font-bold text-text">Page introuvable</h1>

      <p className="mt-2 text-sm text-text-muted">
        La page que vous recherchez n'existe pas ou a été déplacée.
      </p>

      <Link
        to="/"
        className="mt-8 rounded-xl bg-primary px-8 py-3 font-bold text-black active:scale-95"
      >
        Retour à <span className="text-black/70">eco</span>
        <span className="text-black/90">Ride</span>
      </Link>
    </div>
  );
}
