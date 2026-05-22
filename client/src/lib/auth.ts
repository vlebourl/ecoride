import { createAuthClient } from "better-auth/react";

const authClient: ReturnType<typeof createAuthClient> = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "",
});

export const { useSession, signIn, signUp, signOut } = authClient;
