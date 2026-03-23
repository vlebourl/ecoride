import { describe, it, expect } from "vitest";
import * as Sentry from "@sentry/react";

describe("Sentry integration", () => {
  it("Sentry.init does not throw when DSN is empty", () => {
    expect(() => {
      Sentry.init({
        dsn: "",
        enabled: false,
      });
    }).not.toThrow();
  });

  it("Sentry.init does not throw when DSN is undefined", () => {
    expect(() => {
      Sentry.init({
        dsn: undefined,
        enabled: false,
      });
    }).not.toThrow();
  });

  it("Sentry.captureException does not throw when disabled", () => {
    Sentry.init({ dsn: "", enabled: false });
    expect(() => {
      Sentry.captureException(new Error("test error"));
    }).not.toThrow();
  });

  it("beforeSend strips email PII from breadcrumbs", () => {
    // Test the beforeSend logic that we use in main.tsx
    const beforeSend = (event: Sentry.ErrorEvent) => {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => {
          if (b.data?.email) b.data.email = "[redacted]";
          return b;
        });
      }
      return event;
    };

    const event = beforeSend({
      type: undefined,
      breadcrumbs: [
        { data: { email: "user@example.com", url: "/api/trips" } },
        { data: { url: "/api/health" } },
      ],
    } as unknown as Sentry.ErrorEvent);

    expect(event.breadcrumbs?.[0]?.data?.email).toBe("[redacted]");
    expect(event.breadcrumbs?.[0]?.data?.url).toBe("/api/trips");
    expect(event.breadcrumbs?.[1]?.data?.email).toBeUndefined();
  });
});
