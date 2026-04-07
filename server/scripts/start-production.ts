import path from "node:path";
import { ensureLegacyDrizzleBaseline } from "../src/lib/drizzle-baseline";
import { ensureCoolifyBackupBeforeMigration } from "../src/lib/coolify-backup";
import { logger } from "../src/lib/logger";

async function run(command: string[], label: string): Promise<void> {
  const child = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });

  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}`);
  }
}

async function main() {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("start-production.ts must only run in production");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  await ensureCoolifyBackupBeforeMigration({
    databaseUrl,
    coolifyWebhookUrl: process.env.COOLIFY_WEBHOOK_URL,
    coolifyApiToken: process.env.COOLIFY_API_TOKEN,
  });

  await ensureLegacyDrizzleBaseline(databaseUrl, path.resolve(import.meta.dirname, "../drizzle"));
  await run(["bunx", "drizzle-kit", "migrate"], "Database migration");
  logger.info("database_migrations_finished");

  const server = Bun.spawn(["bun", "run", "server/src/index.ts"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });

  process.exit(await server.exited);
}

await main();
