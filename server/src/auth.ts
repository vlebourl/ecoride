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
      leaderboardOptOut: { type: "boolean", required: false, defaultValue: false },
      reminderEnabled: { type: "boolean", required: false, defaultValue: false },
      reminderTime: { type: "string", required: false },
      reminderDays: { type: "string[]", required: false },
    },
  },
});
