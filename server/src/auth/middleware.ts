import { createMiddleware } from "hono/factory";
import { auth } from "../auth";
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
  if (!result) {
    throw unauthorized();
  }
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});
