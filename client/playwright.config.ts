import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    // Force French so e2e assertions on FR strings keep working regardless
    // of the Chromium default locale. English coverage lives in vitest.
    locale: "fr-FR",
  },
  webServer: {
    // Build first: `vite preview` sert `dist/` tel quel. Sans ce build, la suite
    // teste une version antérieure de l'app et affiche un vert trompeur — ça a
    // déjà coûté une tâche entière. Le timeout couvre build + démarrage.
    command: "bun run build && bun run preview --port 4173",
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
