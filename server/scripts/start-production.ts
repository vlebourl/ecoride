import path from "node:path";
import { ensureLegacyDrizzleBaseline } from "../src/lib/drizzle-baseline";
import { ensureCoolifyBackupBeforeMigration } from "../src/lib/coolify-backup";
import { logger } from "../src/lib/logger";
import { forwardTerminationSignals } from "./process-signals";

async function run(command: string[], label: string, cwd?: string): Promise<void> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });

  const stopForwarding = forwardTerminationSignals(child);
  const exitCode = await child.exited;
  stopForwarding();
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
  const repoRoot = path.resolve(import.meta.dirname, "../..");

  await ensureLegacyDrizzleBaseline(databaseUrl, path.resolve(import.meta.dirname, "../drizzle"));
  await run(
    ["bun", "server/node_modules/drizzle-kit/bin.cjs", "migrate", "--config", "drizzle.config.ts"],
    "Database migration",
    repoRoot,
  );
  logger.info("database_migrations_finished");

  const server = Bun.spawn(["bun", "run", "server/src/index.ts"], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });

  const stopForwarding = forwardTerminationSignals(server);
  const exitCode = await server.exited;
  stopForwarding();
  process.exit(exitCode);
}

await main();
