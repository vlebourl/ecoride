import * as Sentry from "@sentry/react";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Bike } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// ErrorBoundary is mounted ABOVE I18nProvider so it can catch provider errors,
// which means useT() is not available here. Read the persisted locale directly
// from localStorage and pick from an inline copy map. Falls back to French.
const FALLBACK_COPY = {
  fr: {
    title: "Une erreur est survenue",
    body: "Quelque chose s'est mal passé. Essayez de recharger la page.",
    reload: "Recharger",
  },
  en: {
    title: "Something went wrong",
    body: "Something broke. Try reloading the page.",
    reload: "Reload",
  },
} as const;

function getFallbackCopy() {
  try {
    const stored = localStorage.getItem("ecoride-locale");
    if (stored === "en") return FALLBACK_COPY.en;
  } catch {
    // localStorage unavailable — fall through to FR.
  }
  return FALLBACK_COPY.fr;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });

    // Auto-reload on stale chunk errors (after deploy, old JS files are gone)
    const msg = error.message || "";
    if (
      msg.includes("not a valid JavaScript MIME type") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Loading chunk") ||
      msg.includes("Loading CSS chunk")
    ) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      const copy = getFallbackCopy();
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15">
            <Bike size={40} className="text-primary-light" />
          </div>

          <h1 className="mt-8 text-2xl font-bold text-text">{copy.title}</h1>

          <p className="mt-2 text-sm text-text-muted">{copy.body}</p>

          <button
            onClick={() => window.location.reload()}
            className="mt-8 rounded-xl bg-primary px-8 py-3 font-bold text-black active:scale-95"
          >
            {copy.reload}
          </button>

          <p className="mt-6 text-xs text-text-muted">
            <span className="text-text">eco</span>
            <span className="text-primary-light">Ride</span>
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
