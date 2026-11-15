// Google sign-in inside the Android app.
//
// Google refuses its web OAuth flow in an embedded WebView
// (`disallowed_useragent`), so the app uses the native account picker
// (Android Credential Manager via @capgo/capacitor-social-login) and hands the
// resulting ID token to Better Auth (`signIn.social({ idToken })`). Better Auth
// verifies issuer, signature, nonce and audience against the *web* client ID
// it already uses, then sets the same session cookie as the web flow: no
// server change, same account as the PWA.
//
// Requires an "Android" OAuth client in the same Google Cloud project, for
// package com.tiarkaerell.ecoride and the SHA-1 of the signing key.

import type { SocialLogin } from "@capgo/capacitor-social-login";
import { signIn } from "@/lib/auth";

// Public value (it is in every Google sign-in URL), not a secret.
const GOOGLE_WEB_CLIENT_ID =
  "1077014709095-qb23ib1prhtkiut51h39fsdj0j3si78f.apps.googleusercontent.com";

type SocialLoginApi = typeof SocialLogin;

let socialLogin: Promise<SocialLoginApi> | null = null;

function plugin(): Promise<SocialLoginApi> {
  socialLogin ??= import("@capgo/capacitor-social-login").then(async ({ SocialLogin }) => {
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } });
    return SocialLogin;
  });
  return socialLogin;
}

/** Native Google sign-in. Resolves once the Better Auth session cookie is set. */
export async function nativeGoogleSignIn(): Promise<void> {
  const SocialLogin = await plugin();
  // Bound to this attempt: Better Auth rejects a token whose nonce differs,
  // so a captured ID token cannot be replayed through this endpoint.
  const nonce = crypto.randomUUID();
  const { result } = await SocialLogin.login({ provider: "google", options: { nonce } });
  const idToken = "idToken" in result ? result.idToken : null;
  if (!idToken) throw new Error("Google did not return an ID token");
  const { error } = await signIn.social({ provider: "google", idToken: { token: idToken, nonce } });
  if (error) throw new Error(error.message ?? "Google sign-in refused");
}
