import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  },
  webServer: {
    command: "bun run preview --port 4173",
    port: 4173,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
