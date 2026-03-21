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

const app = new Hono();

// ---- Global middleware ----
app.use("*", requestId());
app.use("*", logger());
app.use("/api/*", cors({
  origin: [env.FRONTEND_URL],
  credentials: true,
}));

// ---- Better Auth handler (public, before authMiddleware) ----
app.on(["POST", "GET"], "/api/auth/**", (c) => {
  // Behind reverse proxy: rewrite the request URL to use the public baseURL
  // so Better Auth generates correct redirect URLs and cookies
  const reqUrl = new URL(c.req.url);
  const publicUrl = new URL(env.BETTER_AUTH_URL);
  reqUrl.protocol = publicUrl.protocol;
  reqUrl.host = publicUrl.host;
  const proxiedRequest = new Request(reqUrl.toString(), c.req.raw);
  return auth.handler(proxiedRequest);
});

// ---- Health check (public) ----
app.get("/api/health", (c) => c.json({ ok: true, status: "healthy" }));

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
console.log(`EcoRide API starting on port ${env.PORT} (${env.NODE_ENV})`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};

export { app };
