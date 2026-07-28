import type { MiddlewareHandler } from "hono";

/**
 * Third-party origins the client legitimately talks to.
 * - cartocdn: MapLibre style.json, vector tiles, sprites and glyphs
 * - nominatim: destination search (client/src/lib/nominatim.ts)
 * - data.economie.gouv.fr: fuel price fallback fetched client-side
 * - sentry.io: error tracking + session replay ingest
 *   (self-hosted Sentry would need its origin added here)
 * - googleusercontent: Google OAuth avatars
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  // React and MapLibre both inject inline styles at runtime
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.cartocdn.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  // MapLibre and the Sentry replay compressor run workers from blob: URLs
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  [
    "connect-src 'self' blob:",
    "https://*.cartocdn.com",
    "https://nominatim.openstreetmap.org",
    "https://data.economie.gouv.fr",
    "https://*.sentry.io",
  ].join(" "),
].join("; ");

export function securityHeaders(isProduction: boolean): MiddlewareHandler {
  return async (c, next) => {
    if (isProduction) {
      c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    }
    c.header("Content-Security-Policy", CSP_DIRECTIVES);
    c.header("X-Frame-Options", "DENY");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
  };
}
