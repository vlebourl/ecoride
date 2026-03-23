import { test, expect } from "@playwright/test";

/**
 * Regression test for #86: stats evolution charts must respect the period filter.
 *
 * Before the fix, useWeeklyTrips() was hardcoded to Mon→Sun regardless of
 * the selected period. After the fix, useChartTrips(period) fetches the
 * correct date range and the chart data is re-aggregated accordingly.
 *
 * Strategy: intercept /api/trips chart calls (limit=100) and verify that
 * switching period triggers new requests with progressively earlier `from` dates.
 */
test.describe("Stats evolution period filter (#86)", () => {
  test("switching period changes the trips date range query", async ({ page }) => {
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

    const chartFromDates: string[] = [];

    await page.route("**/api/**", (route) => {
      const url = route.request().url();

      // Track chart requests (limit=100 distinguishes them from list requests)
      if (url.includes("/trips") && url.includes("limit=100")) {
        const fromMatch = url.match(/from=([^&]+)/);
        if (fromMatch) chartFromDates.push(decodeURIComponent(fromMatch[1]));
      }

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

    // Load stats page — default period is "week"
    await page.goto("/stats", { waitUntil: "networkidle" });

    // Should have made a chart request for this week
    expect(chartFromDates.length).toBeGreaterThanOrEqual(1);
    const weekFrom = new Date(chartFromDates[chartFromDates.length - 1]);

    // Click "Mois" — should fetch from 1st of current month (earlier than Monday)
    chartFromDates.length = 0;
    await page.getByText("Mois", { exact: true }).click();
    await page.waitForTimeout(1000);
    expect(chartFromDates.length).toBeGreaterThanOrEqual(1);
    const monthFrom = new Date(chartFromDates[chartFromDates.length - 1]);
    expect(monthFrom.getTime()).toBeLessThanOrEqual(weekFrom.getTime());

    // Click "Année" — should fetch from Jan 1st (earlier than 1st of month)
    chartFromDates.length = 0;
    await page.getByText("Année", { exact: true }).click();
    await page.waitForTimeout(1000);
    expect(chartFromDates.length).toBeGreaterThanOrEqual(1);
    const yearFrom = new Date(chartFromDates[chartFromDates.length - 1]);
    expect(yearFrom.getTime()).toBeLessThanOrEqual(monthFrom.getTime());

    // Year start should be in January of the current year
    expect(yearFrom.getFullYear()).toBe(new Date().getFullYear());
    expect(yearFrom.getMonth()).toBeLessThanOrEqual(0); // January = 0
  });
});
