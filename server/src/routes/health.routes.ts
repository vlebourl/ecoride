import { Hono } from "hono";
import { adminMiddleware } from "../auth/admin";
import { getHealthSnapshot } from "../lib/health";
import type { AuthEnv } from "../types/context";

const healthRouter = new Hono<AuthEnv>();

// GET /api/health/detailed — Admin-only detailed health check
healthRouter.get("/detailed", adminMiddleware, async (c) => {
  const snapshot = await getHealthSnapshot();

  return c.json({
    ok: true,
    ...snapshot,
  });
});

export { healthRouter };
