import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  login: vi.fn(),
  social: vi.fn(),
}));
vi.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: { initialize: mocks.initialize, login: mocks.login },
}));
vi.mock("@/lib/auth", () => ({ signIn: { social: mocks.social } }));

import { nativeGoogleSignIn } from "../native-google";

const WEB_CLIENT_ID = "1077014709095-qb23ib1prhtkiut51h39fsdj0j3si78f.apps.googleusercontent.com";

beforeEach(() => {
  mocks.login.mockReset();
  mocks.social.mockReset();
  mocks.social.mockResolvedValue({ data: { token: "session" }, error: null });
});

describe("nativeGoogleSignIn", () => {
  it("signs in to Better Auth with the native ID token and the same nonce", async () => {
    mocks.login.mockResolvedValue({
      provider: "google",
      result: { responseType: "online", idToken: "jwt" },
    });

    await nativeGoogleSignIn();

    // The token's audience must be the web client Better Auth already trusts.
    expect(mocks.initialize).toHaveBeenCalledWith({ google: { webClientId: WEB_CLIENT_ID } });
    const nonce = mocks.login.mock.calls[0]![0].options.nonce as string;
    expect(nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.social).toHaveBeenCalledWith({
      provider: "google",
      idToken: { token: "jwt", nonce },
    });
  });

  it("uses a fresh nonce on every attempt", async () => {
    mocks.login.mockResolvedValue({ provider: "google", result: { idToken: "jwt" } });
    await nativeGoogleSignIn();
    await nativeGoogleSignIn();
    const [first, second] = mocks.login.mock.calls.map((c) => c[0].options.nonce);
    expect(first).not.toBe(second);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });

  it("fails without calling Better Auth when Google returns no ID token", async () => {
    mocks.login.mockResolvedValue({
      provider: "google",
      result: { responseType: "offline", serverAuthCode: "x" },
    });
    await expect(nativeGoogleSignIn()).rejects.toThrow(/ID token/);
    expect(mocks.social).not.toHaveBeenCalled();
  });

  it("surfaces a Better Auth refusal", async () => {
    mocks.login.mockResolvedValue({ provider: "google", result: { idToken: "jwt" } });
    mocks.social.mockResolvedValue({ data: null, error: { message: "Invalid token" } });
    await expect(nativeGoogleSignIn()).rejects.toThrow("Invalid token");
  });
});
