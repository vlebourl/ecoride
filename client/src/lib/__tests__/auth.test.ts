import { describe, expect, it, vi } from "vitest";

const authClient = vi.hoisted(() => ({
  useSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

const createAuthClientMock = vi.hoisted(() => vi.fn(() => authClient));

vi.mock("better-auth/react", () => ({
  createAuthClient: createAuthClientMock,
}));

import { signIn, signOut, signUp, useSession } from "../auth";

describe("auth client exports", () => {
  it("creates the auth client once and re-exports its helpers", () => {
    expect(createAuthClientMock).toHaveBeenCalledWith({ baseURL: "" });
    expect(useSession).toBe(authClient.useSession);
    expect(signIn).toBe(authClient.signIn);
    expect(signUp).toBe(authClient.signUp);
    expect(signOut).toBe(authClient.signOut);
  });
});
