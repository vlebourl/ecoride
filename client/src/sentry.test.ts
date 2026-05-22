import { describe, it, expect } from "vitest";
import { captureClientError, initSentry, redactBreadcrumbEmails } from "@/lib/sentry";

describe("Sentry integration", () => {
  it("initSentry resolves when DSN is not configured", async () => {
    await expect(initSentry()).resolves.toBeUndefined();
  });

  it("captureClientError does not throw when Sentry is disabled", () => {
    expect(() => {
      captureClientError(new Error("test error"));
    }).not.toThrow();
  });

  it("redactBreadcrumbEmails strips email PII from breadcrumbs", () => {
    const event = redactBreadcrumbEmails({
      breadcrumbs: [
        { data: { email: "user@example.com", url: "/api/trips" } },
        { data: { url: "/api/health" } },
      ],
    });

    expect(event.breadcrumbs?.[0]?.data?.email).toBe("[redacted]");
    expect(event.breadcrumbs?.[0]?.data?.url).toBe("/api/trips");
    expect(event.breadcrumbs?.[1]?.data?.email).toBeUndefined();
  });
});
