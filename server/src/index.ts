import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { serveStatic } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { env } from "./env";
import { auth } from "./auth";
import { authMiddleware } from "./auth/middleware";
import { apiRouter } from "./routes";
import { initCronJobs } from "./cron";
import { AppError } from "./lib/errors";
import { getHealthSnapshot } from "./lib/health";
import { rateLimit } from "./lib/rate-limit";
import { logger } from "./lib/logger";
import { sentryWebhookRouter } from "./routes/sentry-webhook.routes";

// ---------------------------------------------------------------------------
// Sentry — server-side error tracking
// Disabled by default; set SENTRY_DSN env var to enable.
// ---------------------------------------------------------------------------
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
  });
}

const app = new Hono();

// ---- Global middleware ----
app.use("*", requestId());

// Structured JSON request logger (replaces hono/logger)
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  const reqId = c.get("requestId") as string | undefined;
  // User may not be set for unauthenticated routes
  const userId = (c.var as Record<string, unknown>)["user"]
    ? ((c.var as Record<string, unknown>)["user"] as { id: string }).id
    : undefined;
  logger.withContext(reqId, userId).info("http_request", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: duration,
  });
});

// ---- HTTP security headers ----
app.use("*", async (c, next) => {
  if (env.NODE_ENV === "production") {
    c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  await next();
});

// ---- CORS for auth routes (before handler, with explicit methods) ----
app.use(
  "/api/auth/*",
  cors({
    origin: env.FRONTEND_URL,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

// ---- CORS for other API routes ----
app.use(
  "/api/*",
  cors({
    origin: [env.FRONTEND_URL],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// ---- Rate limiting for all API routes (100 req/min per IP) ----
app.use("/api/*", rateLimit({ maxRequests: 100, prefix: "api" }));

// ---- Better Auth handler (public, before authMiddleware) ----
// Use ** to match nested paths like /api/auth/callback/google
app.on(["POST", "GET"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

// ---- Health check + version (public) ----
app.get("/api/health", async (c) => {
  const snapshot = await getHealthSnapshot();
  return c.json({
    ok: true,
    status: snapshot.db.connected ? "healthy" : "degraded",
    version: snapshot.version,
    db: snapshot.db.connected,
    activeUsers7d: snapshot.users.active7d,
  });
});

// ---- Sentry webhook (public, no auth required) ----
app.route("/api/sentry-webhook", sentryWebhookRouter);

// ---- Auth middleware for all other /api routes ----
app.use("/api/*", authMiddleware);

// ---- API routes ----
app.route("/api", apiRouter);

// ---- Global error handler ----
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        ok: false,
        error: { code: err.code, message: err.message },
        ...(err.details ? { details: err.details } : {}),
      },
      err.status,
    );
  }
  if (err instanceof HTTPException) {
    return c.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: err.message },
      },
      err.status,
    );
  }
  const reqId = c.get("requestId") as string | undefined;
  const userId = (c.var as Record<string, unknown>)["user"]
    ? ((c.var as Record<string, unknown>)["user"] as { id: string }).id
    : undefined;
  logger.withContext(reqId, userId).error("unhandled_error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    method: c.req.method,
    path: c.req.path,
  });
  if (env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (reqId) scope.setTag("request_id", reqId);
      if (userId) scope.setUser({ id: userId });
      scope.setTag("http.method", c.req.method);
      scope.setTag("http.path", c.req.path);
      Sentry.captureException(err);
    });
  }
  return c.json(
    {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    },
    500,
  );
});

// ---- Static files & SPA fallback (production) ----
if (env.NODE_ENV === "production") {
  // Prevent CDN/Cloudflare from caching the service worker
  app.get("/sw.js", async (c) => {
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    c.header("CDN-Cache-Control", "no-store");
    const file = Bun.file("./client/dist/sw.js");
    return c.body(await file.text(), 200, { "Content-Type": "application/javascript" });
  });
  app.get("/sw-api-guard.js", async (c) => {
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    c.header("CDN-Cache-Control", "no-store");
    const file = Bun.file("./client/dist/sw-api-guard.js");
    return c.body(await file.text(), 200, { "Content-Type": "application/javascript" });
  });
  app.use("/*", serveStatic({ root: "./client/dist" }));
  // SPA fallback: serve index.html for navigation routes only.
  // Static assets (.js, .css, .png, etc.) that don't exist should 404,
  // NOT return index.html (which causes "not a valid JavaScript MIME type" on iOS Safari).
  app.get("*", (c, next) => {
    if (c.req.path.startsWith("/api")) return next();
    if (/\.\w{2,5}$/.test(c.req.path)) return next(); // Has file extension → let 404 handler catch it
    c.header("Cache-Control", "public, max-age=0, must-revalidate");
    return c.html(Bun.file("./client/dist/index.html").text());
  });
}

// ---- 404 handler ----
app.notFound((c) => {
  return c.json(
    {
      ok: false,
      error: { code: "NOT_FOUND", message: `Route not found: ${c.req.method} ${c.req.path}` },
    },
    404,
  );
});

// ---- Cron jobs ----
initCronJobs();

// ---- Start server ----
logger.info("server_starting", { port: env.PORT, env: env.NODE_ENV });

// FIX: Rewrite request URL at the Bun.serve level (not inside Hono handler)
// Behind reverse proxy (Cloudflare → NPM → container), requests arrive as HTTP
// but Better Auth needs the real HTTPS URL to set cookies and generate redirects correctly.
// See: https://hono.dev/examples/behind-reverse-proxy
export default {
  port: env.PORT,
  fetch: (req: Request) => {
    const url = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto");
    if (proto) {
      url.protocol = proto + ":";
    }
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (host && host !== url.host) {
      url.host = host;
    }
    return app.fetch(new Request(url, req));
  },
};

export { app };
