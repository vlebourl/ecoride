import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCoolifyBackupToken } from "../infisical-coolify";

describe("readCoolifyBackupToken", () => {
  const projectId = "3582ed7e-ba02-4e8d-bde9-261d30bb4aaa";
  let folder: string;
  let file: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "ecoride-infisical-test-"));
    file = join(folder, "consumer.json");
    await writeFile(
      file,
      JSON.stringify({
        siteUrl: "https://vault.example.test",
        projectId,
        clientId: "test-client",
        clientSecret: "test-password",
      }),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(folder, { recursive: true, force: true });
  });

  it("logs in and only reads the production Coolify backup secret", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ accessToken: "test-access" }))
      .mockResolvedValueOnce(Response.json({ secret: { secretValue: "test-backup-value" } }));

    expect(await readCoolifyBackupToken(file)).toBe("test-backup-value");
    const [loginUrl, loginRequest] = fetchMock.mock.calls[0] ?? [];
    const [secretUrl, secretRequest] = fetchMock.mock.calls[1] ?? [];
    expect(String(loginUrl)).toBe("https://vault.example.test/api/v1/auth/universal-auth/login");
    expect(loginRequest).toMatchObject({ method: "POST", redirect: "error" });
    expect(String(secretUrl)).toBe(
      `https://vault.example.test/api/v4/secrets/COOLIFY_API_TOKEN?projectId=${projectId}&environment=prod&secretPath=%2F&type=shared`,
    );
    expect(secretRequest).toMatchObject({
      headers: { Authorization: "Bearer test-access" },
      redirect: "error",
    });
  });

  it("reports only the status when Infisical rejects the login", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("private server diagnostic", { status: 403 }));
    await expect(readCoolifyBackupToken(file)).rejects.toThrow(
      "Infisical login failed with HTTP 403",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
