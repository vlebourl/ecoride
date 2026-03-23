import { test, expect } from "@playwright/test";

/**
 * Regression test for the leaderboard period filter and category switcher.
 *
 * Verifies that:
 * 1. The leaderboard page loads without crashing
 * 2. The period switcher buttons (Semaine, Mois, Tout) are visible
 * 3. Clicking a period button updates the active state
 * 4. The category switcher buttons (CO₂, Série, Trajets, Vitesse) are visible
 * 5. Clicking a category button updates the active state
 */

test.describe("Leaderboard period filter", () => {
  test.beforeEach(async ({ page }) => {
    // Unregister any existing service workers so they don't intercept API stubs
    await page.goto("/login");
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    });

    // Prevent re-registration of the service worker
    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    // Stub all API calls
    await page.route("**/api/**", (route) => {
      const url = route.request().url();

      // Return a proper session for auth endpoints
      if (url.includes("/api/auth/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: {
              id: "test-session",
              userId: "test-user",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
            user: {
              id: "test-user",
              name: "Test User",
              email: "test@example.com",
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
      }

      // Return empty leaderboard for all other API calls
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { entries: [], userRank: null } }),
      });
    });
  });

  test("shows period switcher buttons", async ({ page }) => {
    await page.goto("/leaderboard", { waitUntil: "networkidle" });

    // Page should NOT show the error boundary
    const errorBoundary = page.getByText("Une erreur est survenue");
    await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });

    // Period switcher should be visible with all 3 buttons
    const switcher = page.getByTestId("period-switcher");
    await expect(switcher).toBeVisible();

    await expect(switcher.getByText("Semaine")).toBeVisible();
    await expect(switcher.getByText("Mois")).toBeVisible();
    await expect(switcher.getByText("Tout")).toBeVisible();
  });

  test("clicking a period button updates active state", async ({ page }) => {
    await page.goto("/leaderboard", { waitUntil: "networkidle" });

    const switcher = page.getByTestId("period-switcher");
    await expect(switcher).toBeVisible();

    // "Tout" should be active by default (has primary color class)
    const toutBtn = switcher.getByText("Tout");
    await expect(toutBtn).toHaveClass(/bg-primary/);

    // Click "Semaine" and verify it becomes active
    const semaineBtn = switcher.getByText("Semaine");
    await semaineBtn.click();
    await expect(semaineBtn).toHaveClass(/bg-primary/);

    // "Tout" should no longer have the active style
    await expect(toutBtn).toHaveClass(/bg-surface-high/);
  });

  test("shows category switcher buttons", async ({ page }) => {
    await page.goto("/leaderboard", { waitUntil: "networkidle" });

    // Page should NOT show the error boundary
    const errorBoundary = page.getByText("Une erreur est survenue");
    await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });

    // Category switcher should be visible with all 5 icon buttons
    const catSwitcher = page.getByTestId("category-switcher");
    await expect(catSwitcher).toBeVisible();

    await expect(catSwitcher.getByLabel("CO₂")).toBeVisible();
    await expect(catSwitcher.getByLabel("Série")).toBeVisible();
    await expect(catSwitcher.getByLabel("Trajets")).toBeVisible();
    await expect(catSwitcher.getByLabel("Vitesse")).toBeVisible();
    await expect(catSwitcher.getByLabel("€")).toBeVisible();
  });

  test("clicking a category button updates active state", async ({ page }) => {
    await page.goto("/leaderboard", { waitUntil: "networkidle" });

    const catSwitcher = page.getByTestId("category-switcher");
    await expect(catSwitcher).toBeVisible();

    // "CO₂" should be active by default
    const co2Btn = catSwitcher.getByLabel("CO₂");
    await expect(co2Btn).toHaveClass(/bg-primary/);

    // Click "Série" and verify it becomes active
    const serieBtn = catSwitcher.getByLabel("Série");
    await serieBtn.click();
    await expect(serieBtn).toHaveClass(/bg-primary/);

    // "CO₂" should no longer have the active style
    await expect(co2Btn).toHaveClass(/bg-surface-high/);
  });
});
