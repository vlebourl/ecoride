import { test, expect } from "@playwright/test";

// Regression test for #165: MapLibre native bearing eliminates black corners during rotation.
// Before the fix: Leaflet CSS rotate() caused black corners and incorrect rider position.
// After the fix: MapLibre uses native bearing; data-bearing attribute reflects actual map bearing.

test("tracking map bearing matches rider heading when tracking (heading=90)", async ({ page }) => {
  await page.addInitScript(() => {
    const mockPos: GeolocationPosition = {
      coords: {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: 90, // East — rider is heading east
        speed: 5, // 18 km/h, above the 1.8 km/h threshold
      } as GeolocationCoordinates,
      timestamp: Date.now(),
    };

    let watchId = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: (success: PositionCallback) => {
          const id = ++watchId;
          setTimeout(() => success(mockPos), 50);
          return id;
        },
        clearWatch: () => {},
        getCurrentPosition: (success: PositionCallback) => {
          setTimeout(() => success(mockPos), 50);
        },
      },
      writable: true,
      configurable: true,
    });
  });

  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    }),
  );

  await page.goto("/trip", { waitUntil: "networkidle" });

  // Start tracking
  await page.getByText("Démarrer").click();
  await expect(page.getByText("Terminer")).toBeVisible({ timeout: 5000 });

  // Wait for GPS to fire and React to update
  await page.waitForTimeout(1500);

  // data-heading is set directly from gps.state.heading (no WebGL required)
  const headingAttr = await page
    .locator('[data-testid="tracking-map"]')
    .getAttribute("data-heading");

  const heading = Number(headingAttr);
  expect(heading).toBeGreaterThanOrEqual(85);
  expect(heading).toBeLessThanOrEqual(95);
});

test("tracking map bearing is 0 when heading is null (stationary start)", async ({ page }) => {
  await page.addInitScript(() => {
    const mockPos: GeolocationPosition = {
      coords: {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null, // No heading — stationary
        speed: null,
      } as GeolocationCoordinates,
      timestamp: Date.now(),
    };

    let watchId = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: (success: PositionCallback) => {
          const id = ++watchId;
          setTimeout(() => success(mockPos), 50);
          return id;
        },
        clearWatch: () => {},
        getCurrentPosition: (success: PositionCallback) => {
          setTimeout(() => success(mockPos), 50);
        },
      },
      writable: true,
      configurable: true,
    });
  });

  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    }),
  );

  await page.goto("/trip", { waitUntil: "networkidle" });

  await page.getByText("Démarrer").click();
  await expect(page.getByText("Terminer")).toBeVisible({ timeout: 5000 });

  await page.waitForTimeout(1500);

  const headingAttr = await page
    .locator('[data-testid="tracking-map"]')
    .getAttribute("data-heading");

  expect(headingAttr).toBe("0");
});
