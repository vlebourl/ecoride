import type * as SentryModule from "@sentry/react";

type BreadcrumbEvent = {
  breadcrumbs?: Array<{
    data?: Record<string, unknown> | null;
  }>;
};

const sentryDsn = import.meta.env.VITE_SENTRY_DSN || "";
const sentryEnabled = sentryDsn.length > 0;

let sentryModulePromise: Promise<typeof SentryModule> | null = null;
let sentryInitPromise: Promise<void> | null = null;

async function loadSentry() {
  if (!sentryEnabled) return null;
  try {
    sentryModulePromise ??= import("@sentry/react").catch((error) => {
      sentryModulePromise = null;
      throw error;
    });
    return await sentryModulePromise;
  } catch {
    return null;
  }
}

export function redactBreadcrumbEmails<T extends BreadcrumbEvent>(event: T): T {
  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      if (breadcrumb.data && "email" in breadcrumb.data) {
        breadcrumb.data.email = "[redacted]";
      }
    }
  }
  return event;
}

export function initSentry() {
  if (!sentryEnabled) return Promise.resolve();
  if (sentryInitPromise) return sentryInitPromise;

  sentryInitPromise = (async () => {
    const Sentry = await loadSentry();
    if (!Sentry) return;

    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      release: __APP_VERSION__,
      enabled: true,
      sendDefaultPii: true,
      integrations: [Sentry.replayIntegration()],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      beforeSend: redactBreadcrumbEmails,
    });
  })().catch(() => {
    sentryInitPromise = null;
  });

  return sentryInitPromise;
}

export function captureClientError(error: unknown, extra?: Record<string, unknown>) {
  void loadSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.captureException(error, extra ? { extra } : undefined);
  });
}

export function bindUnhandledRejectionListener() {
  window.addEventListener("unhandledrejection", (event) => {
    captureClientError(event.reason);
  });
}
