import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import { isValidIanaTimezone } from "../lib/timezone";
import type { AuthEnv } from "../types/context";

export const timezoneMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const currentUser = c.get("user");
  const requestedTimezone = c.req.header("x-timezone");

  if (!requestedTimezone || !isValidIanaTimezone(requestedTimezone)) {
    await next();
    return;
  }

  if (requestedTimezone !== currentUser.timezone) {
    await db
      .update(user)
      .set({ timezone: requestedTimezone, updatedAt: new Date() })
      .where(eq(user.id, currentUser.id));

    c.set("user", { ...currentUser, timezone: requestedTimezone });
  }

  await next();
});
