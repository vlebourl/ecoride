import { describe, expect, it, vi } from "vitest";
import {
  ensureCoolifyBackupBeforeMigration,
  extractCoolifyApiBaseUrl,
  extractDatabaseResourceUuid,
} from "../coolify-backup";

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("coolify backup guard", () => {
  it("derives the Coolify API base URL from the webhook URL", () => {
    expect(
      extractCoolifyApiBaseUrl("http://coolify:8080/api/v1/deploy?uuid=app-123&force=false"),
    ).toBe("http://coolify:8080/api/v1");
  });

  it("derives the database resource UUID from DATABASE_URL host", () => {
    expect(
      extractDatabaseResourceUuid(
        "postgresql://ecoride:secret@y12rxn4gjzsw1c3933wbe1wb:5432/ecoride",
      ),
    ).toBe("y12rxn4gjzsw1c3933wbe1wb");
  });

  it("fails closed when no Coolify backup is configured in production", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      ensureCoolifyBackupBeforeMigration({
        databaseUrl: "postgresql://ecoride:secret@y12rxn4gjzsw1c3933wbe1wb:5432/ecoride",
        coolifyWebhookUrl: "http://coolify:8080/api/v1/deploy?uuid=app-123",
        coolifyApiToken: "token",
        fetchImpl: fetchMock as unknown as typeof fetch,
        pollIntervalMs: 0,
        timeoutMs: 10,
      }),
    ).rejects.toThrow("no enabled scheduled backup configuration");
  });

  it("triggers a fresh backup and waits for success before allowing migrations", async () => {
    const originalBun = (globalThis as any).Bun;
    (globalThis as any).Bun = {
      sleep: vi.fn().mockResolvedValue(undefined),
    };

    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                uuid: "backup-1",
                enabled: true,
                frequency: "0 */4 * * *",
                executions: [
                  {
                    uuid: "old-exec",
                    status: "success",
                    filename: "/old.dmp",
                    created_at: "2026-04-07T16:19:02Z",
                  },
                ],
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: "Database backup configuration updated" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              executions: [
                {
                  uuid: "old-exec",
                  status: "success",
                  filename: "/old.dmp",
                  created_at: "2026-04-07T16:19:02Z",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              executions: [
                {
                  uuid: "new-exec",
                  status: "success",
                  filename: "/new.dmp",
                  message: null,
                  created_at: "2026-04-07T16:25:00Z",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      const result = await ensureCoolifyBackupBeforeMigration({
        databaseUrl: "postgresql://ecoride:secret@y12rxn4gjzsw1c3933wbe1wb:5432/ecoride",
        coolifyWebhookUrl: "http://coolify:8080/api/v1/deploy?uuid=app-123",
        coolifyApiToken: "token",
        fetchImpl: fetchMock as unknown as typeof fetch,
        pollIntervalMs: 0,
        timeoutMs: 100,
      });

      expect(result).toEqual({
        backupUuid: "backup-1",
        executionUuid: "new-exec",
        filename: "/new.dmp",
      });
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "http://coolify:8080/api/v1/databases/y12rxn4gjzsw1c3933wbe1wb/backups/backup-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ backup_now: true }),
        }),
      );
    } finally {
      if (originalBun) {
        (globalThis as any).Bun = originalBun;
      } else {
        Reflect.deleteProperty(globalThis, "Bun");
      }
    }
  });
});
