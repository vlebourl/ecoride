import { z } from "zod";
import { logger } from "./lib/logger";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:noreply@example.com"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  COOLIFY_WEBHOOK_URL: z.string().url().optional(),
  COOLIFY_API_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  ORS_API_KEY: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    logger.error("invalid_env_vars", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
