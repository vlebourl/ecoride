import { test, expect } from "@playwright/test";

// Regression test for ECO-20: map must rotate to match rider heading during tracking.
// Before the fix: map.getContainer() had no transform; it always pointed north.
// After the fix: map.getContainer() gets rotate(-heading deg) applied.

test("map container rotates to match rider heading when tracking", async ({ page }) => {
  // Override geolocation with a heading value (Playwright's built-in mock does not
  // support heading/speed, so we inject a full replacement via addInitScript).
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

  // Wait for the GPS callback and React re-render to propagate
  await page.waitForTimeout(1500);

  // The Leaflet container inside the tracking map div should now be rotated.
  // rotate(-90deg) because heading = 90 and we apply rotate(-heading).
  const transform = await page
    .locator('[data-testid="tracking-map"] .leaflet-container')
    .evaluate((el: HTMLElement) => el.style.transform);

  expect(transform).toMatch(/rotate\(-90deg\)/);
});

test("map container has no rotation when heading is null (stationary start)", async ({ page }) => {
  // Geolocation returns null heading (stationary or unavailable)
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

  // With null heading, the container transform should be empty (north-up).
  const transform = await page
    .locator('[data-testid="tracking-map"] .leaflet-container')
    .evaluate((el: HTMLElement) => el.style.transform);

  expect(transform).toBe("");
});
