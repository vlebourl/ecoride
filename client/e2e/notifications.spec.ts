import { test, expect } from "@playwright/test";

/**
 * Regression test for: "DOMException: Invalid raw ECDSA P-256 public key"
 * When VAPID key is empty or invalid, subscribeToPush must return null
 * instead of crashing. The profile page must remain functional.
 *
 * Note: Profile page requires auth, so we test via the smoke test pattern
 * (stubbed API) and verify no crash. The actual VAPID validation logic
 * is tested via vitest in client/src/lib/__tests__/push.test.ts.
 */

test("profile page does not crash with empty VAPID key stub", async ({ page }) => {
  // Stub all API calls — including auth session
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/push/vapid-key")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { publicKey: "" } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });

  await page.goto("/profile", { waitUntil: "networkidle" });

  // The error boundary text should NOT be visible
  const errorBoundary = page.getByText("Une erreur est survenue");
  await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });
});
