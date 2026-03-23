import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify every page loads without crashing.
 *
 * These run against `vite preview` (static build, no API).
 * API calls will fail (no server), but that's fine — we're testing
 * that React renders without throwing (no hooks-order violations,
 * missing imports, or layout crashes).
 *
 * The ErrorBoundary renders "Une erreur est survenue" on crash,
 * so we check that this text is NOT visible.
 */

const PAGES = [
  { path: "/login", name: "Login" },
  { path: "/trip", name: "Trip" },
  { path: "/stats", name: "Stats" },
  { path: "/leaderboard", name: "Leaderboard" },
  { path: "/profile", name: "Profile" },
  { path: "/admin", name: "Admin" },
  { path: "/privacy", name: "Privacy" },
  { path: "/nonexistent", name: "404" },
];

for (const { path, name } of PAGES) {
  test(`${name} (${path}) loads without crash`, async ({ page }) => {
    // Stub API calls to prevent network errors from crashing React
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      }),
    );

    await page.goto(path, { waitUntil: "networkidle" });

    // Page should NOT show the error boundary
    const errorBoundary = page.getByText("Une erreur est survenue");
    await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });

    // Page should have rendered something (not blank)
    const body = page.locator("body");
    await expect(body).not.toBeEmpty();
  });
}

test.describe("admin dashboard", () => {
  // Block service workers so route stubs can intercept fetch requests
  test.use({ serviceWorkers: "block" });

  test("Admin (/admin) renders dashboard when user is admin", async ({ page }) => {
    const adminUser = {
      id: "admin-1",
      name: "Admin",
      email: "admin@test.com",
      isAdmin: true,
      image: null,
      vehicleModel: null,
      fuelType: null,
      consumptionL100: null,
      mileage: null,
      leaderboardOptOut: false,
      reminderEnabled: false,
      reminderTime: null,
      reminderDays: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      emailVerified: true,
    };

    // Single route handler that dispatches based on URL
    await page.route(/\/api\//, (route) => {
      const url = route.request().url();

      if (url.includes("/api/auth/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: adminUser,
            session: {
              id: "session-1",
              token: "test-token",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          }),
        });
      }

      if (url.includes("/api/user/profile")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              user: adminUser,
              stats: {
                totalDistanceKm: 0,
                totalCo2SavedKg: 0,
                totalMoneySavedEur: 0,
                totalFuelSavedL: 0,
                tripCount: 0,
              },
            },
          }),
        });
      }

      if (url.includes("/api/admin/health")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              version: "1.0.0",
              uptime: 3600,
              userCount: 5,
              tripCount: 42,
              tripsToday: 3,
              tripsThisWeek: 12,
              dbConnected: true,
            },
          }),
        });
      }

      if (url.includes("/api/admin/stats")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              users: [],
              recentTrips: [],
              dailyTripCounts: [],
            },
          }),
        });
      }

      // Default stub for any other API calls
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: {} }),
      });
    });

    await page.goto("/admin", { waitUntil: "networkidle" });

    // Should not crash
    const errorBoundary = page.getByText("Une erreur est survenue");
    await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });

    // Should show admin header text
    const adminHeader = page.getByText("Admin");
    await expect(adminHeader).toBeVisible({ timeout: 5000 });
  });
});
