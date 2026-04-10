import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema/auth";
import { unauthorized } from "../lib/errors";

type AuthSession = {
  user: typeof auth.$Infer.Session.user;
  session: typeof auth.$Infer.Session.session;
};

export const authMiddleware = createMiddleware<{
  Variables: {
    user: AuthSession["user"];
    session: AuthSession["session"];
  };
}>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result?.user || !result?.session) {
    throw unauthorized();
  }

  const [currentUser] = await db.select().from(user).where(eq(user.id, result.user.id));
  if (!currentUser) {
    throw unauthorized();
  }

  c.set("user", currentUser);
  c.set("session", result.session);
  await next();
});
