import { readFile } from "node:fs/promises";
import { z } from "zod";

const consumerSchema = z.object({
  siteUrl: z.string().url(),
  projectId: z.string().uuid(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

const loginSchema = z.object({ accessToken: z.string().min(1) });
const secretSchema = z.object({ secret: z.object({ secretValue: z.string().min(1) }) });

async function requestJson(url: URL, options: RequestInit, stage: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(`Infisical ${stage} request failed`);
  }
  if (!response.ok) {
    throw new Error(`Infisical ${stage} failed with HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`Infisical ${stage} returned invalid JSON`);
  }
}

export async function readCoolifyBackupToken(consumerFile: string): Promise<string> {
  const config = await readFile(consumerFile, "utf8")
    .then((content): unknown => JSON.parse(content))
    .catch(() => null);
  const parsed = consumerSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error("Could not read the Infisical consumer configuration");
  }
  const { siteUrl, projectId, clientId, clientSecret } = parsed.data;
  const site = new URL(siteUrl);
  if (site.protocol !== "https:" || site.username || site.password) {
    throw new Error("Infisical requires an HTTPS origin");
  }

  const login = loginSchema.safeParse(
    await requestJson(
      new URL("/api/v1/auth/universal-auth/login", site.origin),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Ecoride/1.0" },
        body: JSON.stringify({ clientId, clientSecret }),
      },
      "login",
    ),
  );
  if (!login.success) {
    throw new Error("Infisical login did not return an access token");
  }

  const secretUrl = new URL("/api/v4/secrets/COOLIFY_API_TOKEN", site.origin);
  secretUrl.search = new URLSearchParams({
    projectId,
    environment: "prod",
    secretPath: "/",
    type: "shared",
  }).toString();
  const secret = secretSchema.safeParse(
    await requestJson(
      secretUrl,
      {
        headers: {
          Authorization: `Bearer ${login.data.accessToken}`,
          "User-Agent": "Ecoride/1.0",
        },
      },
      "secret read",
    ),
  );
  if (!secret.success) {
    throw new Error("Infisical did not return a Coolify backup token");
  }
  return secret.data.secret.secretValue;
}
