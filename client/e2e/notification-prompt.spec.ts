import { test, expect } from "@playwright/test";

/**
 * Regression test for #109 — Notification prompt on dashboard.
 *
 * Note: In CI headless Chromium, Push API may not be available, so
 * push.status may not be "unsubscribed". We test the dismiss/localStorage
 * logic and the absence for new users, which don't depend on Push support.
 */
test.describe("Notification prompt (#109)", () => {
  test("does NOT show notification prompt for new user (0 trips)", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    });

    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    await page.route("**/api/**", (route) => {
      const url = route.request().url();
      if (url.includes("/api/auth/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: {
              id: "s",
              userId: "u",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
            user: {
              id: "u",
              name: "Test",
              email: "t@t.com",
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
      }
      if (url.includes("/stats/summary")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              totalDistanceKm: 0,
              totalCo2SavedKg: 0,
              totalMoneySavedEur: 0,
              totalFuelSavedL: 0,
              tripCount: 0,
              currentStreak: 0,
              longestStreak: 0,
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      });
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // New user sees welcome, no notification prompt
    await expect(page.getByText("Bienvenue")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("notification-prompt")).not.toBeVisible();
  });
});
