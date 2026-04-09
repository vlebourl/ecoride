import { test, expect } from "@playwright/test";

/**
 * Regression test for #130: Trip detail slide-up panel must be anchored to the
 * viewport bottom (position: fixed), not the page content bottom.
 *
 * Before the fix, the bottom sheet was rendered inside the PullToRefresh
 * container which applies CSS `transform` on its children. This created a new
 * containing block, causing `position: fixed` to behave like `position: absolute`
 * relative to the PullToRefresh wrapper instead of the viewport.
 *
 * After the fix, the bottom sheet is rendered via createPortal to document.body,
 * escaping the PullToRefresh transform context.
 */
test.describe("Trip detail panel viewport anchoring (#130)", () => {
  test.use({ serviceWorkers: "block" });

  test("bottom sheet is anchored to viewport bottom, not page bottom", async ({ page }) => {
    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    const trip = {
      id: "trip-1",
      userId: "u",
      distanceKm: 5.2,
      durationSec: 1200,
      co2SavedKg: 1.8,
      moneySavedEur: 1.5,
      fuelSavedL: 0.6,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      gpsPoints: [],
    };

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

      if (url.match(/\/trips\/trip-1$/)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: { trip } }),
        });
      }

      if (url.includes("/trips")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: { trips: [trip] },
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

    // Click the trip to open the bottom sheet
    await page.getByText("+5.2 KM").click();

    // Wait for the bottom sheet dialog
    const sheet = page.getByRole("dialog", { name: "Détail du trajet" });
    await expect(sheet).toBeVisible({ timeout: 3000 });

    // The dialog must have position: fixed (not absolute/relative/static)
    const position = await sheet.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe("fixed");

    // The dialog must be a direct child of document.body (rendered via portal),
    // NOT inside the PullToRefresh container which applies transform and breaks fixed positioning
    const parentTagName = await sheet.evaluate((el) => el.parentElement?.tagName);
    expect(parentTagName).toBe("BODY");
  });
});
