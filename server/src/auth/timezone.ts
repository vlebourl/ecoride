import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "../types/context";

/**
 * Backend time handling is UTC-only. Persisted user timezones are frontend-owned
 * display preferences and must not mutate request processing on the server.
 */
export const timezoneMiddleware = createMiddleware<AuthEnv>(async (_c, next) => {
  await next();
});
