import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Bike } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15">
            <Bike size={40} className="text-primary-light" />
          </div>

          <h1 className="mt-8 text-2xl font-bold text-text">
            Une erreur est survenue
          </h1>

          <p className="mt-2 text-sm text-text-muted">
            Quelque chose s'est mal passé. Essayez de recharger la page.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="mt-8 rounded-xl bg-primary px-8 py-3 font-bold text-black active:scale-95"
          >
            Recharger
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
