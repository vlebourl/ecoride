import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "node:path";
const pkgVersion = (() => {
  try {
    return require("../package.json").version;
  } catch {
    return "0.0.0";
  }
})();

const gitHash = (() => {
  try {
    return require("node:child_process").execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return process.env.GIT_HASH || null;
  }
})();

const appVersion = gitHash ? `${pkgVersion}-${gitHash}` : pkgVersion;

// Upload source maps to Sentry for readable production stack traces.
// Set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT env vars (e.g. as
// GitHub Actions secrets) to enable. No-op when any of these is absent.
const sentryPlugin =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          telemetry: false,
        }),
      ]
    : [];

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    // 'hidden' emits the .map files (so Sentry can still upload source maps
    // during CI) but strips the `//# sourceMappingURL=` comment from the JS,
    // so browsers never try to fetch the stripped maps in production. This
    // avoids the DevTools warning "No sources are declared in this source map"
    // which appears because @sentry/vite-plugin removes the sources array
    // after uploading.
    sourcemap: "hidden",
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ecoRide",
        short_name: "ecoRide",
        description: "Suivez vos trajets vélo et vos économies CO₂",
        lang: "fr",
        theme_color: "#1e272e",
        background_color: "#1e272e",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Démarrer un trajet",
            short_name: "Trajet",
            url: "/trip",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Voir les stats",
            short_name: "Stats",
            url: "/stats",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ["/sw-api-guard.js"],
        // Feature #242 — passive map tile caching. Tiles and style assets
        // already fetched by the user are stored so the map keeps rendering
        // offline and on bad connections. No bulk prefetch (would violate
        // the CARTO basemap ToS) — only what the user has actually loaded.
        // The cache name is referenced from src/lib/tile-cache.ts and is
        // preserved across version bumps in main.tsx so users don't lose
        // their downloaded tiles on every deploy.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /(^|\.)basemaps\.cartocdn\.com$/i.test(url.hostname),
            handler: "CacheFirst",
            options: {
              cacheName: "ecoride-map-tiles-v1",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    ...sentryPlugin,
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ecoride/shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
