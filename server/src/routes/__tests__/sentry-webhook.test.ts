import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => {
  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();
  const mockWithContext = vi.fn(() => ({
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
  }));

  return { mockLoggerInfo, mockLoggerError, mockWithContext };
});

vi.mock("../../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withContext: mocks.mockWithContext,
  },
}));

import { sentryWebhookRouter } from "../sentry-webhook.routes";

function buildApp() {
  const app = new Hono();
  app.route("/sentry-webhook", sentryWebhookRouter);
  return app;
}

const sentryIssuePayload = {
  action: "created",
  data: {
    issue: {
      id: "12345",
      title: "TypeError: Cannot read properties of null",
      culprit: "x._updateStyleComponents(assets/MapNoWebGL-wV9AEAM0)",
      shortId: "ECORIDE-42",
      permalink: "https://sentry.io/issues/12345/",
      level: "error",
      status: "unresolved",
      platform: "javascript",
      metadata: {
        type: "TypeError",
        value: "Cannot read properties of null (reading '_loaded')",
        filename: "assets/MapNoWebGL-wV9AEAM0.js",
      },
      count: "11",
      firstSeen: "2026-04-09T10:00:00Z",
      lastSeen: "2026-04-09T10:11:00Z",
    },
  },
};

describe("POST /sentry-webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SENTRY_WEBHOOK_SECRET;
    delete process.env.GITHUB_TOKEN;
    vi.unstubAllGlobals();
  });

  it("returns 500 when SENTRY_WEBHOOK_SECRET is not set", async () => {
    const res = await buildApp().request("/sentry-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sentryIssuePayload),
    });

    expect(res.status).toBe(500);
    expect(mocks.mockLoggerError).toHaveBeenCalledWith("sentry_webhook_no_secret", {});
  });

  it("responds OK to installation verification events", async () => {
    process.env.SENTRY_WEBHOOK_SECRET = "test-secret";

    const res = await buildApp().request("/sentry-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-resource": "installation",
      },
      body: JSON.stringify({ action: "created" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("ignores non-issue resources", async () => {
    process.env.SENTRY_WEBHOOK_SECRET = "test-secret";

    const res = await buildApp().request("/sentry-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-resource": "metric_alert",
      },
      body: JSON.stringify({ action: "created" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.mockLoggerInfo).toHaveBeenCalledWith("sentry_webhook_ignored_resource", {
      resource: "metric_alert",
    });
  });

  it("ignores non-created issue actions", async () => {
    process.env.SENTRY_WEBHOOK_SECRET = "test-secret";

    const res = await buildApp().request("/sentry-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-resource": "issue",
      },
      body: JSON.stringify({ ...sentryIssuePayload, action: "resolved" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.mockLoggerInfo).toHaveBeenCalledWith("sentry_webhook_ignored_action", {
      action: "resolved",
    });
  });

  it("returns 500 when GITHUB_TOKEN is not set", async () => {
    process.env.SENTRY_WEBHOOK_SECRET = "test-secret";

    const res = await buildApp().request("/sentry-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-resource": "issue",
      },
      body: JSON.stringify(sentryIssuePayload),
    });

    expect(res.status).toBe(500);
    expect(mocks.mockLoggerError).toHaveBeenCalledWith("sentry_webhook_no_github_token", {});
  });

  it("creates a GitHub issue when a new Sentry issue is received", async () => {
    process.env.SENTRY_WEBHOOK_SECRET = "test-secret";
    process.env.GITHUB_TOKEN = "ghp_test";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            number: 210,
            html_url: "https://github.com/vlebourl/ecoride/issues/210",
          }),
      }),
    );

    const res = await buildApp().request("/sentry-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-resource": "issue",
      },
      body: JSON.stringify(sentryIssuePayload),
    });

    const body = (await res.json()) as { ok: boolean; data: { githubIssue: number } };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.githubIssue).toBe(210);

    // Verify the GitHub API was called with correct payload
    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("https://api.github.com/repos/vlebourl/ecoride/issues");
    const ghPayload = JSON.parse(fetchCall[1].body as string);
    expect(ghPayload.title).toContain("TypeError");
    expect(ghPayload.title).toContain("Cannot read properties of null");
    expect(ghPayload.labels).toEqual(["bug", "sentry"]);
    expect(ghPayload.body).toContain("ECORIDE-42");
    expect(ghPayload.body).toContain("https://sentry.io/issues/12345/");

    expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(
      "sentry_webhook_github_issue_created",
      expect.objectContaining({
        sentryId: "ECORIDE-42",
        githubIssue: 210,
      }),
    );
  });

  it("returns 502 when GitHub API fails", async () => {
    process.env.SENTRY_WEBHOOK_SECRET = "test-secret";
    process.env.GITHUB_TOKEN = "ghp_test";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve("Validation failed"),
      }),
    );

    const res = await buildApp().request("/sentry-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-resource": "issue",
      },
      body: JSON.stringify(sentryIssuePayload),
    });

    expect(res.status).toBe(502);
    expect(mocks.mockLoggerError).toHaveBeenCalledWith(
      "sentry_webhook_github_failed",
      expect.objectContaining({ status: 422 }),
    );
  });
});
