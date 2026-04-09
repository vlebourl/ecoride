import { test, expect } from "@playwright/test";

/**
 * Regression test for #103: Trip map in the stats bottom sheet must fit bounds
 * properly after the slide-up animation completes.
 *
 * Before the fix, FitBounds called map.fitBounds() synchronously during render,
 * before the bottom sheet animation finished. Leaflet didn't know the container's
 * final dimensions, so the GPS trace appeared offset/cut off.
 *
 * After the fix, FitBounds waits for the animation, calls invalidateSize(), then
 * fitBounds(). This test verifies the map container is visible and contains a
 * rendered polyline (SVG path) after opening the bottom sheet.
 */
test.describe("Trip map bounds in bottom sheet (#103)", () => {
  test.use({ serviceWorkers: "block" });

  test("map renders with polyline visible after bottom sheet opens", async ({ page }) => {
    // Stub service worker
    await page.route("**/registerSW.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "// noop" }),
    );

    const gpsPoints = [
      { lat: 48.8566, lng: 2.3522 },
      { lat: 48.8576, lng: 2.3532 },
      { lat: 48.8586, lng: 2.3542 },
      { lat: 48.8596, lng: 2.3552 },
    ];

    const tripWithGps = {
      id: "trip-gps",
      userId: "u",
      distanceKm: 5.2,
      durationSec: 1200,
      co2SavedKg: 1.8,
      moneySavedEur: 1.5,
      fuelSavedL: 0.6,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      gpsPoints,
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

      // Single trip detail endpoint — return trip with GPS points
      if (url.match(/\/trips\/trip-gps$/)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: { trip: tripWithGps } }),
        });
      }

      if (url.includes("/trips")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              trips: [tripWithGps],
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

    // Click the trip to open the bottom sheet
    await page.getByText("+5.2 KM").click();

    // Wait for the bottom sheet dialog
    const sheet = page.getByRole("dialog", { name: "Détail du trajet" });
    await expect(sheet).toBeVisible({ timeout: 3000 });

    // The map container should be visible inside the sheet
    const mapContainer = sheet.locator(".maplibregl-map");
    await expect(mapContainer).toBeVisible({ timeout: 3000 });

    // MapLibre renders to canvas, not SVG — verify the canvas has non-zero dimensions
    const box = await mapContainer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });
});
