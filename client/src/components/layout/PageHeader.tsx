import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  /** Page title — always rendered as the unique <h1> of the page */
  title: string;
  /** Optional subtitle shown under the title */
  subtitle?: ReactNode;
  /**
   * If true, the title is visually hidden but still present for screen readers.
   * Use for pages where the visual title would be redundant (e.g. the home
   * dashboard where the logo already identifies the app).
   */
  titleHidden?: boolean;
  /** Back button. If provided, an ArrowLeft link is rendered in the header bar. */
  back?: { to: string; label?: string };
  /** Slot rendered on the right side of the sticky header bar. */
  right?: ReactNode;
}

export function PageHeader({ title, subtitle, titleHidden, back, right }: PageHeaderProps) {
  return (
    <>
      <header
        role="banner"
        className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-bg/80 px-6 py-4 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          {back && (
            <Link
              to={back.to}
              aria-label={back.label ?? "Retour"}
              className="rounded-lg p-1 text-text-muted transition-colors hover:text-text active:scale-95"
            >
              <ArrowLeft size={20} />
            </Link>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tighter">
              <span className="text-text">eco</span>
              <span className="text-primary-light">Ride</span>
            </span>
            <span className="text-xs text-text-dim">v{__APP_VERSION__}</span>
          </div>
        </div>
        {right ? <div className="flex items-center gap-2">{right}</div> : null}
      </header>

      {titleHidden ? (
        <h1 className="sr-only">{title}</h1>
      ) : (
        <div className="px-6 pb-2 pt-4">
          <h1 className="text-4xl font-extrabold tracking-tighter text-text">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm font-medium text-text-dim">{subtitle}</p> : null}
        </div>
      )}
    </>
  );
}
