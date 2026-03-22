import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { App } from "./App";
import "./app.css";

// Purge all SW caches when app version changes
(async () => {
  const CACHE_VERSION_KEY = "ecoride-version";
  const prev = localStorage.getItem(CACHE_VERSION_KEY);
  if (prev !== __APP_VERSION__) {
    localStorage.setItem(CACHE_VERSION_KEY, __APP_VERSION__);
    if (prev !== null) {
      // Version changed — nuke all caches and reload once
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));
      window.location.reload();
    }
  }
})();

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
