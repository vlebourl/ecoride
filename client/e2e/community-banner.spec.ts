import { test, expect } from "@playwright/test";

/**
 * Tests for the community impact banner on the leaderboard page.
 * Verifies:
 * 1. The banner renders with correct data from the API stub
 * 2. CO₂ comparisons text appears when CO₂ > 0
 * 3. Changing the period re-fires the community stats request
 */

test.describe("Community impact banner", () => {
  const communityFixture = {
    period: "all",
    totalCo2SavedKg: 12500,
    totalFuelSavedL: 5400,
    totalMoneySavedEur: 8100,
    totalDistanceKm: 45000,
    activeUsers: 42,
    tripCount: 312,
    generatedAt: new Date().toISOString(),
  };

  test.beforeEach(async ({ page }) => {
    // Unregister service workers and clear caches
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

      if (url.includes("/api/stats/community")) {
        const searchParams = new URL(url).searchParams;
        const period = searchParams.get("period") ?? "all";
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: { ...communityFixture, period },
          }),
        });
      }

      // Stub leaderboard and everything else
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { entries: [], userRank: null } }),
      });
    });
  });

  test("renders community banner with data", async ({ page }) => {
    await page.goto("/leaderboard", { waitUntil: "networkidle" });

    const errorBoundary = page.getByText("Une erreur est survenue");
    await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });

    const banner = page.getByTestId("community-banner");
    await expect(banner).toBeVisible();

    await expect(page.getByTestId("community-banner-co2")).toBeVisible();
    await expect(page.getByTestId("community-banner-fuel")).toBeVisible();
    await expect(page.getByTestId("community-banner-money")).toBeVisible();
    await expect(page.getByTestId("community-banner-distance")).toBeVisible();
    await expect(page.getByTestId("community-banner-users")).toBeVisible();
  });

  test("shows CO₂ comparisons when totalCo2SavedKg > 0", async ({ page }) => {
    await page.goto("/leaderboard", { waitUntil: "networkidle" });

    const comparisons = page.getByTestId("community-banner-comparisons");
    await expect(comparisons).toBeVisible();

    // 12500 kg / 1760 kg/flight = ~7 flights
    await expect(comparisons).toContainText("7");
    // 12500 kg / 25 kg/tree = 500 trees
    await expect(comparisons).toContainText("500");
  });

  test("re-fires community stats request when period changes", async ({ page }) => {
    const communityRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/stats/community")) {
        communityRequests.push(req.url());
      }
    });

    await page.goto("/leaderboard", { waitUntil: "networkidle" });

    const initialCount = communityRequests.length;

    // Click a different period
    const switcher = page.getByTestId("period-switcher");
    await switcher.getByText("Semaine").click();
    await page.waitForTimeout(200);

    expect(communityRequests.length).toBeGreaterThan(initialCount);
    const lastUrl = communityRequests[communityRequests.length - 1];
    expect(lastUrl).toContain("period=week");
  });
});
