import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { App } from "./App";
import "./app.css";

// Purge all SW caches when app version changes
async function purgeAndReload() {
  const names = await caches.keys();
  await Promise.all(names.map((n) => caches.delete(n)));
  const regs = await navigator.serviceWorker?.getRegistrations();
  if (regs) await Promise.all(regs.map((r) => r.unregister()));
  window.location.reload();
}

(async () => {
  const CACHE_VERSION_KEY = "ecoride-version";
  const prev = localStorage.getItem(CACHE_VERSION_KEY);
  if (prev !== __APP_VERSION__) {
    localStorage.setItem(CACHE_VERSION_KEY, __APP_VERSION__);
    if (prev !== null) await purgeAndReload();
  }
})();

// Poll server for new version every 5 minutes (catches updates while app stays open)
// Skip reload if a GPS trip is being tracked (backup key present = active tracking)
setInterval(
  async () => {
    try {
      if (localStorage.getItem("ecoride-tracking-backup")) return; // Don't interrupt active tracking
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.version && data.version !== __APP_VERSION__) {
        localStorage.setItem("ecoride-version", data.version);
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
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
