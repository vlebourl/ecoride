import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { validationHook } from "../lib/validation";
import { rateLimit } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import type { AuthEnv } from "../types/context";

const feedbackSchema = z.object({
  type: z.enum(["bug", "feature"]),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
});

const feedbackRouter = new Hono<AuthEnv>();

// POST /api/feedback — Create a GitHub issue from user feedback (3 req/hour)
feedbackRouter.post(
  "/",
  rateLimit({ maxRequests: 3, windowMs: 60 * 60 * 1000, prefix: "feedback" }),
  zValidator("json", feedbackSchema, validationHook),
  async (c) => {
    const data = c.req.valid("json");
    const currentUser = c.get("user");
    const requestLogger = logger.withContext(
      c.get("requestId") as string | undefined,
      currentUser.id,
    );

    const label = data.type === "bug" ? "bug" : "enhancement";
    const prefix = data.type === "bug" ? "Bug report" : "Feature request";
    const title = `[In-app] ${prefix}: ${data.title}`;
    const body = `${data.description}\n\n---\n*Submitted by ${currentUser.name ?? currentUser.email} via ecoRide app*`;

    const githubToken = process.env.GITHUB_TOKEN;

    if (githubToken) {
      try {
        const res = await fetch("https://api.github.com/repos/vlebourl/ecoride/issues", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, body, labels: [label] }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          requestLogger.error("github_issue_creation_failed", {
            status: res.status,
            body: errBody,
            type: data.type,
            title: data.title,
            label,
          });
          return c.json({ ok: false, error: "Failed to create issue" }, 502);
        }

        const issue = (await res.json()) as { number: number; html_url: string };
        logAudit(currentUser.id, "feedback_submitted", data.title, {
          type: data.type,
          title: data.title,
          githubIssue: issue.number,
        });
        requestLogger.info("github_issue_created", {
          type: data.type,
          title: data.title,
          label,
          githubIssue: issue.number,
        });

        return c.json({
          ok: true,
          data: { issueNumber: issue.number, issueUrl: issue.html_url },
        });
      } catch (err) {
        requestLogger.error("github_issue_creation_error", {
          error: err instanceof Error ? err.message : String(err),
          type: data.type,
          title: data.title,
          label,
        });
        return c.json({ ok: false, error: "Failed to create issue" }, 502);
      }
    }

    // No GitHub token — just log it
    logAudit(currentUser.id, "feedback_submitted", data.title, {
      type: data.type,
      title: data.title,
      description: data.description,
    });
    requestLogger.info("feedback_received_no_github", {
      type: data.type,
      title: data.title,
      label,
    });

    return c.json({ ok: true, data: { issueNumber: null, issueUrl: null } });
  },
);

export { feedbackRouter };
