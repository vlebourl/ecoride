import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthEnv } from "../../types/context";

const mocks = vi.hoisted(() => {
  const mockLogAudit = vi.fn();
  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();
  const mockWithContext = vi.fn(() => ({
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
  }));

  return { mockLogAudit, mockLoggerInfo, mockLoggerError, mockWithContext };
});

vi.mock("../../lib/audit", () => ({
  logAudit: mocks.mockLogAudit,
}));

vi.mock("../../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withContext: mocks.mockWithContext,
  },
}));

vi.mock("../../lib/rate-limit", () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

import { feedbackRouter } from "../feedback.routes";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("user", {
      id: "user-1",
      name: "Lyra",
      email: "lyra@example.com",
    } as AuthEnv["Variables"]["user"]);
    c.set("requestId", "req-feedback-1");
    await next();
  });
  app.route("/feedback", feedbackRouter);
  return app;
}

describe("POST /feedback", () => {
  const payload = {
    type: "bug",
    title: "Crash in tracker",
    description: "The tracker crashes after resuming from the background.",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
    vi.unstubAllGlobals();
  });

  it("logs a contextual success event when GitHub issue creation succeeds", async () => {
    process.env.GITHUB_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            number: 187,
            html_url: "https://github.com/vlebourl/ecoride/issues/187",
          }),
      }),
    );

    const res = await buildApp().request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as { ok: boolean; data: { issueNumber: number } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.issueNumber).toBe(187);
    expect(mocks.mockWithContext).toHaveBeenCalledWith("req-feedback-1", "user-1");
    expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(
      "github_issue_created",
      expect.objectContaining({
        type: "bug",
        title: "Crash in tracker",
        label: "bug",
        githubIssue: 187,
      }),
    );
  });

  it("logs structured GitHub API failures with request context", async () => {
    process.env.GITHUB_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve("upstream bad gateway"),
      }),
    );

    const res = await buildApp().request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(502);
    expect(mocks.mockLoggerError).toHaveBeenCalledWith(
      "github_issue_creation_failed",
      expect.objectContaining({
        status: 502,
        body: "upstream bad gateway",
        type: "bug",
        title: "Crash in tracker",
        label: "bug",
      }),
    );
  });

  it("logs fetch exceptions with request context", async () => {
    process.env.GITHUB_TOKEN = "token";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await buildApp().request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(502);
    expect(mocks.mockLoggerError).toHaveBeenCalledWith(
      "github_issue_creation_error",
      expect.objectContaining({
        error: "network down",
        type: "bug",
        title: "Crash in tracker",
        label: "bug",
      }),
    );
  });

  it("logs non-GitHub fallback submissions with context", async () => {
    const res = await buildApp().request("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "feature",
        title: "Dark mode",
        description: "Please add a true dark mode for night rides.",
      }),
    });

    const body = (await res.json()) as { ok: boolean; data: { issueNumber: null } };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.issueNumber).toBeNull();
    expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(
      "feedback_received_no_github",
      expect.objectContaining({
        type: "feature",
        title: "Dark mode",
        label: "enhancement",
      }),
    );
  });
});
