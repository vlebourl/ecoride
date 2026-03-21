import type { auth } from "../auth";

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;

export type AuthEnv = {
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
};
