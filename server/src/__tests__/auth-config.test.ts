import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../db/schema", () => ({}));
vi.mock("../env", () => ({
  env: {
    NODE_ENV: "development",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    FRONTEND_URL: "http://localhost:5173",
  },
}));

import { auth } from "../auth";

describe("better-auth account linking config", () => {
  // Regression: `accountLinking` used to sit at the top level of the
  // betterAuth() options, where Better Auth never reads it. The whole block
  // was dead config and Google was not actually a trusted provider.
  it("declares accountLinking under `account`, where Better Auth reads it", () => {
    expect(auth.options.account?.accountLinking).toMatchObject({
      enabled: true,
      trustedProviders: ["google"],
    });
  });

  it("keeps requireLocalEmailVerified at its secure default", () => {
    // ecoRide has no email-verification flow, so setting this to false would
    // reopen GHSA-g38m-r43w-p2q7: pre-register victim@example.com with a
    // password, wait for the victim to sign in with Google, inherit the account.
    // Cast: the inferred options type only knows the keys we actually set, so
    // reading an absent key needs a wider view. If someone adds
    // `requireLocalEmailVerified: false`, this assertion catches it.
    const linking = auth.options.account?.accountLinking as
      | { requireLocalEmailVerified?: boolean }
      | undefined;
    expect(linking?.requireLocalEmailVerified).not.toBe(false);
  });
});
