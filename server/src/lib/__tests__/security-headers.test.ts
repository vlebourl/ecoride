import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { securityHeaders } from "../security-headers";

function buildApp(isProduction: boolean) {
  const app = new Hono();
  app.use("*", securityHeaders(isProduction));
  app.get("/", (c) => c.text("ok"));
  return app;
}

async function csp(isProduction = true) {
  const res = await buildApp(isProduction).request("/");
  return res.headers.get("Content-Security-Policy") ?? "";
}

describe("securityHeaders", () => {
  it("sets a Content-Security-Policy header", async () => {
    expect(await csp()).toContain("default-src 'self'");
  });

  it("locks down the directives that block injection and clickjacking", async () => {
    const header = await csp();
    expect(header).toContain("script-src 'self'");
    expect(header).toContain("object-src 'none'");
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).toContain("base-uri 'self'");
    expect(header).not.toContain("unsafe-eval");
  });

  it("allows the third-party origins the app actually uses", async () => {
    const header = await csp();
    // Breaking any of these breaks the map, the destination search,
    // the fuel price fallback or the Google avatars.
    for (const origin of [
      "https://*.cartocdn.com",
      "https://nominatim.openstreetmap.org",
      "https://data.economie.gouv.fr",
      "https://*.sentry.io",
      "https://*.googleusercontent.com",
    ]) {
      expect(header).toContain(origin);
    }
    expect(header).toContain("worker-src 'self' blob:");
  });

  it("keeps the pre-existing headers", async () => {
    const res = await buildApp(true).request("/");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
  });

  it("only sends HSTS in production", async () => {
    const res = await buildApp(false).request("/");
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
  });
});
