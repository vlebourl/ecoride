import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { env } from "./env";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
  },
  accountLinking: {
    enabled: true,
    trustedProviders: ["google"],
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  trustedOrigins: [env.FRONTEND_URL],
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    trustedProxyHeaders: true,
    // sameSite must remain "lax" (not "strict") because Better Auth's
    // OAuth callback flow uses a cross-site redirect from the provider
    // (e.g. Google) back to /api/auth/callback/*. With "strict", the
    // session cookie would not be sent on that redirect, breaking login.
    // CSRF protection is handled by Better Auth's built-in state/nonce
    // verification on OAuth callbacks and its CSRF token on form posts.
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
  },
  user: {
    additionalFields: {
      vehicleModel: { type: "string", required: false },
      fuelType: { type: "string", required: false },
      consumptionL100: { type: "number", required: false },
      mileage: { type: "number", required: false },
      timezone: { type: "string", required: false },
      leaderboardOptOut: { type: "boolean", required: false, defaultValue: false },
      reminderEnabled: { type: "boolean", required: false, defaultValue: false },
      reminderTime: { type: "string", required: false },
      reminderDays: { type: "string[]", required: false },
      isAdmin: { type: "boolean", required: false, defaultValue: false },
      super73Enabled: { type: "boolean", required: false, defaultValue: false },
      super73AutoModeEnabled: { type: "boolean", required: false, defaultValue: false },
      super73DefaultMode: { type: "string", required: false },
      super73DefaultAssist: { type: "number", required: false },
      super73DefaultLight: { type: "boolean", required: false },
    },
  },
});
