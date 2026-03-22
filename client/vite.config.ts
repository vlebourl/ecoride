import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
const gitHash = (() => {
  try {
    const { execSync } = require("node:child_process");
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return process.env.GIT_HASH || "unknown";
  }
})();

const pkgVersion = (() => {
  try {
    return require("../package.json").version;
  } catch {
    return "0.0.0";
  }
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${pkgVersion}-${gitHash}`),
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
        theme_color: "#2ecc71",
        background_color: "#1e272e",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
