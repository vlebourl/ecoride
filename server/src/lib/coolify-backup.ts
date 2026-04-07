import { logger } from "./logger";

export interface CoolifyBackupExecution {
  uuid: string;
  status: string;
  message: string | null;
  filename: string | null;
  created_at: string;
  updated_at?: string;
  finished_at?: string | null;
}

export interface CoolifyBackupConfig {
  uuid: string;
  enabled: boolean;
  frequency: string;
  executions?: CoolifyBackupExecution[];
}

export interface EnsureCoolifyBackupParams {
  databaseUrl: string;
  coolifyWebhookUrl?: string;
  coolifyApiToken?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface EnsureCoolifyBackupResult {
  backupUuid: string;
  executionUuid: string;
  filename: string | null;
}

export interface SkipCoolifyBackupResult {
  skipped: true;
  reason: "missing_config";
}

function parseJson<T>(value: unknown): T {
  return value as T;
}

export function extractDatabaseResourceUuid(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  if (!parsed.hostname) {
    throw new Error("DATABASE_URL must include a hostname");
  }
  return parsed.hostname;
}

export function extractCoolifyApiBaseUrl(coolifyWebhookUrl: string): string {
  const parsed = new URL(coolifyWebhookUrl);
  return `${parsed.origin}/api/v1`;
}

async function readJsonOrThrow<T>(response: Response, errorPrefix: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${errorPrefix}: HTTP ${response.status}${body ? ` — ${body}` : ""}`);
  }

  return parseJson<T>(await response.json());
}

function pickEnabledBackup(backups: CoolifyBackupConfig[]): CoolifyBackupConfig {
  const enabled = backups.find((backup) => backup.enabled);
  if (!enabled) {
    throw new Error("Coolify production database has no enabled scheduled backup configuration");
  }
  return enabled;
}

function getLatestExecution(
  executions: CoolifyBackupExecution[],
): CoolifyBackupExecution | undefined {
  return executions[0];
}

export async function ensureCoolifyBackupBeforeMigration({
  databaseUrl,
  coolifyWebhookUrl,
  coolifyApiToken,
  fetchImpl = fetch,
  pollIntervalMs = 2_000,
  timeoutMs = 120_000,
}: EnsureCoolifyBackupParams): Promise<EnsureCoolifyBackupResult | SkipCoolifyBackupResult> {
  const hasWebhookUrl = Boolean(coolifyWebhookUrl);
  const hasApiToken = Boolean(coolifyApiToken);

  if (!hasWebhookUrl && !hasApiToken) {
    logger.warn("coolify_backup_check_skipped", {
      reason: "missing_config",
    });
    return { skipped: true, reason: "missing_config" };
  }

  if (!hasWebhookUrl || !hasApiToken) {
    throw new Error(
      "COOLIFY_WEBHOOK_URL and COOLIFY_API_TOKEN must either both be configured or both be omitted",
    );
  }
  const webhookUrl = coolifyWebhookUrl as string;
  const apiToken = coolifyApiToken as string;

  const apiBaseUrl = extractCoolifyApiBaseUrl(webhookUrl);
  const databaseResourceUuid = extractDatabaseResourceUuid(databaseUrl);
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  logger.info("coolify_backup_check_started", { databaseResourceUuid });

  const backupsResponse = await fetchImpl(
    `${apiBaseUrl}/databases/${databaseResourceUuid}/backups`,
    {
      headers,
    },
  );
  const backups = await readJsonOrThrow<CoolifyBackupConfig[]>(
    backupsResponse,
    "Failed to fetch Coolify backup configuration",
  );

  const backup = pickEnabledBackup(backups);
  const previousExecutionUuid = getLatestExecution(backup.executions ?? [])?.uuid;

  const triggerResponse = await fetchImpl(
    `${apiBaseUrl}/databases/${databaseResourceUuid}/backups/${backup.uuid}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ backup_now: true }),
    },
  );
  await readJsonOrThrow<Record<string, unknown>>(
    triggerResponse,
    "Failed to trigger Coolify backup",
  );

  logger.info("coolify_backup_triggered", {
    databaseResourceUuid,
    backupUuid: backup.uuid,
    previousExecutionUuid,
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await Bun.sleep(pollIntervalMs);

    const executionsResponse = await fetchImpl(
      `${apiBaseUrl}/databases/${databaseResourceUuid}/backups/${backup.uuid}/executions`,
      { headers },
    );
    const body = await readJsonOrThrow<{ executions: CoolifyBackupExecution[] }>(
      executionsResponse,
      "Failed to read Coolify backup execution status",
    );

    const execution = getLatestExecution(body.executions ?? []);
    if (!execution || execution.uuid === previousExecutionUuid) {
      continue;
    }

    if (execution.status === "success") {
      logger.info("coolify_backup_succeeded", {
        databaseResourceUuid,
        backupUuid: backup.uuid,
        executionUuid: execution.uuid,
        filename: execution.filename,
      });
      return {
        backupUuid: backup.uuid,
        executionUuid: execution.uuid,
        filename: execution.filename,
      };
    }

    if (execution.status === "failed") {
      throw new Error(
        `Coolify backup failed before migration${execution.message ? `: ${execution.message}` : ""}`,
      );
    }
  }

  throw new Error(`Timed out waiting for Coolify backup ${backup.uuid} to finish before migration`);
}
