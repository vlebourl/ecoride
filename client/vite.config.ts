import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
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

// To upload source maps to Sentry for readable production stack traces,
// install @sentry/vite-plugin and add to the plugins array:
//   import { sentryVitePlugin } from "@sentry/vite-plugin";
//   sentryVitePlugin({ org: "your-org", project: "ecoride-client" })

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
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
      },
    }),
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
