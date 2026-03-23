import { createMiddleware } from "hono/factory";
import { forbidden } from "../lib/errors";
import type { AuthEnv } from "../types/context";

/**
 * Admin middleware — must be used AFTER authMiddleware.
 * Checks that the authenticated user has isAdmin === true.
 * Returns 403 Forbidden otherwise.
 */
export const adminMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user || user.isAdmin !== true) {
    throw forbidden("Admin access required");
  }
  await next();
});
