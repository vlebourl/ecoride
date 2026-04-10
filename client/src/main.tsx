import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nProvider } from "./i18n/provider";
import { App } from "./App";
import { hasBlockingTripDataForUpdate } from "@/lib/update-guard";
import "./app.css";

// ---------------------------------------------------------------------------
// Sentry — client-side error tracking
// Disabled by default; set VITE_SENTRY_DSN to enable.
// ---------------------------------------------------------------------------
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  environment: import.meta.env.MODE,
  release: __APP_VERSION__,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  sendDefaultPii: true,
  integrations: [Sentry.replayIntegration()],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event: Sentry.ErrorEvent) {
    if (event.breadcrumbs) {
      for (const b of event.breadcrumbs) {
        if (b.data && "email" in b.data) {
          (b.data as Record<string, unknown>).email = "[redacted]";
        }
      }
    }
    return event;
  },
});

// Capture unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  Sentry.captureException(event.reason);
});

const CACHE_VERSION_KEY = "ecoride-version";
const PENDING_VERSION_KEY = "ecoride-pending-version";

// Purge all SW caches when app version changes
async function purgeAndReload() {
  const names = await caches.keys();
  await Promise.all(names.map((n) => caches.delete(n)));
  const regs = await navigator.serviceWorker?.getRegistrations();
  if (regs) await Promise.all(regs.map((r) => r.unregister()));
  window.location.reload();
}

(async () => {
  const pendingVersion = localStorage.getItem(PENDING_VERSION_KEY);
  if (pendingVersion && pendingVersion !== __APP_VERSION__ && !hasBlockingTripDataForUpdate()) {
    localStorage.setItem(CACHE_VERSION_KEY, pendingVersion);
    localStorage.removeItem(PENDING_VERSION_KEY);
    await purgeAndReload();
    return;
  }

  const prev = localStorage.getItem(CACHE_VERSION_KEY);
  if (prev !== __APP_VERSION__) {
    localStorage.setItem(CACHE_VERSION_KEY, __APP_VERSION__);
    if (prev !== null && !hasBlockingTripDataForUpdate()) await purgeAndReload();
  }
})();

// Poll server for new version every 5 minutes (catches updates while app stays open)
// Defer activation while a trip is active, stopped-but-unsaved, or still queued.
setInterval(
  async () => {
    try {
      const pendingVersion = localStorage.getItem(PENDING_VERSION_KEY);
      if (pendingVersion && pendingVersion !== __APP_VERSION__) {
        if (hasBlockingTripDataForUpdate()) return;
        localStorage.setItem(CACHE_VERSION_KEY, pendingVersion);
        localStorage.removeItem(PENDING_VERSION_KEY);
        await purgeAndReload();
        return;
      }

      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.version && data.version !== __APP_VERSION__) {
        if (hasBlockingTripDataForUpdate()) {
          localStorage.setItem(PENDING_VERSION_KEY, data.version);
          return;
        }

        localStorage.setItem(CACHE_VERSION_KEY, data.version);
        localStorage.removeItem(PENDING_VERSION_KEY);
        await purgeAndReload();
      }
    } catch {
      /* offline or error — ignore */
    }
  },
  5 * 60 * 1000,
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
