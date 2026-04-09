import { Hono } from "hono";
import { logger } from "../lib/logger";

const sentryWebhookRouter = new Hono();

// Sentry webhook event types we care about
interface SentryIssueEvent {
  action: string;
  data: {
    issue: {
      id: string;
      title: string;
      culprit: string;
      shortId: string;
      permalink: string;
      level: string;
      status: string;
      platform: string;
      metadata: {
        type?: string;
        value?: string;
        filename?: string;
      };
      count: string;
      firstSeen: string;
      lastSeen: string;
    };
  };
}

function verifySentrySignature(body: string, signature: string, secret: string): boolean {
  const crypto = globalThis.crypto;
  // Sentry uses HMAC-SHA256
  const encoder = new TextEncoder();
  // Use Bun's sync crypto for simplicity
  const hmac = new Bun.CryptoHasher("sha256", encoder.encode(secret));
  hmac.update(encoder.encode(body));
  const expected = hmac.digest("hex");
  return expected === signature;
}

// POST /api/sentry-webhook — Receive Sentry issue events and create GitHub issues
sentryWebhookRouter.post("/", async (c) => {
  const webhookLogger = logger.withContext(c.get("requestId") as string | undefined);

  const sentrySecret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!sentrySecret) {
    webhookLogger.error("sentry_webhook_no_secret", {});
    return c.json({ ok: false, error: "Webhook not configured" }, 500);
  }

  // Verify signature
  const signature = c.req.header("sentry-hook-signature");
  const rawBody = await c.req.text();

  if (signature) {
    if (!verifySentrySignature(rawBody, signature, sentrySecret)) {
      webhookLogger.error("sentry_webhook_invalid_signature", {});
      return c.json({ ok: false, error: "Invalid signature" }, 401);
    }
  }

  // Sentry sends a verification request on setup
  const resource = c.req.header("sentry-hook-resource");
  if (resource === "installation") {
    webhookLogger.info("sentry_webhook_installation_event", {});
    return c.json({ ok: true });
  }

  // We only care about issue events
  if (resource !== "issue") {
    webhookLogger.info("sentry_webhook_ignored_resource", { resource });
    return c.json({ ok: true });
  }

  let event: SentryIssueEvent;
  try {
    event = JSON.parse(rawBody) as SentryIssueEvent;
  } catch {
    webhookLogger.error("sentry_webhook_invalid_json", {});
    return c.json({ ok: false, error: "Invalid JSON" }, 400);
  }

  // Only create GitHub issues for new issues (not resolved, assigned, etc.)
  if (event.action !== "created") {
    webhookLogger.info("sentry_webhook_ignored_action", { action: event.action });
    return c.json({ ok: true });
  }

  const issue = event.data.issue;
  webhookLogger.info("sentry_webhook_new_issue", {
    sentryId: issue.shortId,
    title: issue.title,
    level: issue.level,
  });

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    webhookLogger.error("sentry_webhook_no_github_token", {});
    return c.json({ ok: false, error: "GitHub token not configured" }, 500);
  }

  // Build GitHub issue
  const errorType = issue.metadata.type ? `\`${issue.metadata.type}\`` : "Error";
  const errorValue = issue.metadata.value ?? issue.title;
  const title = `[Sentry] ${errorType}: ${errorValue}`;

  const body = [
    `## ${errorType}`,
    "",
    `> ${errorValue}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Sentry ID** | [${issue.shortId}](${issue.permalink}) |`,
    `| **Level** | ${issue.level} |`,
    `| **Culprit** | \`${issue.culprit}\` |`,
    `| **First seen** | ${issue.firstSeen} |`,
    `| **Events** | ${issue.count} |`,
    "",
    `[View in Sentry](${issue.permalink})`,
  ].join("\n");

  try {
    const res = await fetch("https://api.github.com/repos/vlebourl/ecoride/issues", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body,
        labels: ["bug", "sentry"],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      webhookLogger.error("sentry_webhook_github_failed", {
        status: res.status,
        body: errBody,
      });
      return c.json({ ok: false, error: "Failed to create GitHub issue" }, 502);
    }

    const ghIssue = (await res.json()) as { number: number; html_url: string };
    webhookLogger.info("sentry_webhook_github_issue_created", {
      sentryId: issue.shortId,
      githubIssue: ghIssue.number,
      url: ghIssue.html_url,
    });

    return c.json({ ok: true, data: { githubIssue: ghIssue.number } });
  } catch (err) {
    webhookLogger.error("sentry_webhook_github_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json({ ok: false, error: "Failed to create GitHub issue" }, 502);
  }
});

export { sentryWebhookRouter };
