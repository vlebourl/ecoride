import { test, expect } from "@playwright/test";

/**
 * Regression test for #280: stats line chart must render a Y axis.
 *
 * Before the fix, YAxis was missing from the recharts LineChart, so the chart
 * had no vertical scale. After the fix, a <g class="recharts-yAxis"> element
 * is rendered with at least one tick label.
 */
test.describe("Stats chart Y axis (#280)", () => {
  test("stats chart renders a Y axis with tick labels", async ({ page }) => {
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

      if (url.includes("/api/user/profile")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              user: {
                id: "u",
                name: "Test",
                email: "t@t.com",
                image: null,
                vehicleModel: null,
                fuelType: null,
                consumptionL100: null,
                mileage: null,
                timezone: "Europe/Paris",
                leaderboardOptOut: false,
                reminderEnabled: false,
                reminderTime: null,
                reminderDays: null,
                isAdmin: false,
                super73Enabled: false,
                super73AutoModeEnabled: false,
                super73DefaultMode: null,
                super73DefaultAssist: null,
                super73DefaultLight: null,
                super73AutoModeLowSpeedKmh: null,
                super73AutoModeHighSpeedKmh: null,
                createdAt: new Date().toISOString(),
              },
              stats: {
                totalDistanceKm: 120,
                totalCo2SavedKg: 18,
                totalMoneySavedEur: 25,
                totalFuelSavedL: 10,
                tripCount: 5,
              },
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
              totalDistanceKm: 120,
              totalCo2SavedKg: 18,
              totalMoneySavedEur: 25,
              totalFuelSavedL: 10,
              tripCount: 5,
              currentStreak: 2,
            },
          }),
        });
      }

      if (url.includes("/trips")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              trips: [
                {
                  id: "t1",
                  userId: "u",
                  distanceKm: 10,
                  durationSec: 1800,
                  co2SavedKg: 1.5,
                  moneySavedEur: 2.1,
                  fuelSavedL: 0.7,
                  startedAt: new Date().toISOString(),
                  endedAt: new Date().toISOString(),
                  gpsPoints: null,
                },
              ],
            },
            pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { achievements: [] } }),
      });
    });

    await page.goto("/stats", { waitUntil: "networkidle" });

    // The recharts YAxis renders as a <g class="recharts-yAxis"> in the DOM.
    // We assert attachment (not visibility) because ResponsiveContainer gets
    // zero width in headless mode, which makes recharts hide the SVG elements
    // even though they are present in the DOM.
    const yAxis = page.locator(".recharts-yAxis");
    await expect(yAxis).toBeAttached();

    // At least one tick element must exist inside the Y axis group
    const ticks = yAxis.locator(".recharts-cartesian-axis-tick");
    await expect(ticks.first()).toBeAttached();
  });
});
