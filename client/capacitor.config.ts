import type { CapacitorConfig } from "@capacitor/cli";

// The app shell loads the deployed site, so it shares its origin (session
// cookies, API, OAuth callback) and picks up every web deploy without a rebuild.
// CAP_SERVER_URL points a debug build elsewhere (e.g. a dev server over adb reverse).
const config: CapacitorConfig = {
  appId: "com.tiarkaerell.ecoride",
  appName: "ecoRide",
  webDir: "dist",
  plugins: {
    // Google only: the plugin's sync hook turns these into Gradle flags, so no
    // Facebook/Apple/Twitter SDK is compiled into the APK.
    SocialLogin: { providers: { google: true, facebook: false, apple: false, twitter: false } },
  },
  server: {
    url: process.env.CAP_SERVER_URL ?? "https://ecoride.tiarkaerell.com",
    cleartext: process.env.CAP_SERVER_URL?.startsWith("http://") ?? false,
  },
};

export default config;
