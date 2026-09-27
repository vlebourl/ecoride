import type { Config } from "drizzle-kit";

export default {
  dialect: "postgresql",
  schema: "./server/src/db/schema.ts",
  out: "./server/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
