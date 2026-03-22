import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { serveStatic } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { env } from "./env";
import { auth } from "./auth";
import { authMiddleware } from "./auth/middleware";
import { apiRouter } from "./routes";
import { initCronJobs } from "./cron";
import { AppError } from "./lib/errors";
import { rateLimit } from "./lib/rate-limit";

const app = new Hono();

// ---- Global middleware ----
app.use("*", requestId());
app.use("*", logger());

// ---- CORS for auth routes (before handler, with explicit methods) ----
app.use("/api/auth/*", cors({
  origin: env.FRONTEND_URL,
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["POST", "GET", "OPTIONS"],
  credentials: true,
}));

// ---- CORS for other API routes ----
app.use("/api/*", cors({
  origin: [env.FRONTEND_URL],
  credentials: true,
}));

// ---- Rate limiting for all API routes (100 req/min per IP) ----
app.use("/api/*", rateLimit({ maxRequests: 100, prefix: "api" }));

// ---- Better Auth handler (public, before authMiddleware) ----
// Use ** to match nested paths like /api/auth/callback/google
app.on(["POST", "GET"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

// ---- Health check + version (public) ----
const appVersion = (() => {
  try { return require("../../package.json").version; }
  catch { return "unknown"; }
})();
app.get("/api/health", (c) => c.json({ ok: true, status: "healthy", version: appVersion }));

// ---- Auth middleware for all other /api routes ----
app.use("/api/*", authMiddleware);

// ---- API routes ----
app.route("/api", apiRouter);

// ---- Global error handler ----
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({
      ok: false,
      error: { code: err.code, message: err.message },
      ...(err.details ? { details: err.details } : {}),
    }, err.status);
  }
  if (err instanceof HTTPException) {
    return c.json({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: err.message },
    }, err.status);
  }
  console.error("[UNHANDLED]", err);
  return c.json({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  }, 500);
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
  // SPA fallback: serve index.html for non-API routes that don't match a static file
  app.get("*", (c, next) => {
    if (c.req.path.startsWith("/api")) return next();
    return c.html(Bun.file("./client/dist/index.html").text());
  });
}

// ---- 404 handler ----
app.notFound((c) => {
  return c.json({
    ok: false,
    error: { code: "NOT_FOUND", message: `Route not found: ${c.req.method} ${c.req.path}` },
  }, 404);
});

// ---- Cron jobs ----
initCronJobs();

// ---- Start server ----
console.log(`ecoRide API starting on port ${env.PORT} (${env.NODE_ENV})`);

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
