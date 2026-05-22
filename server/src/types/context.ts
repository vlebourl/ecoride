import type { auth } from "../auth";

type AuthUser = typeof auth.$Infer.Session.user;
type AuthSession = typeof auth.$Infer.Session.session;

export type AuthEnv = {
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
};
