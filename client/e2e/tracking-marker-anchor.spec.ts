import { test, expect } from "@playwright/test";

// Regression test for #234: during an active trip, the rider arrow must stay
// horizontally centered in the tracking map and anchored toward the bottom
// (camera padding: top=200, bottom=0). We simulate several GPS updates to
// exercise the useMapCamera throttle/trailing-edge/retry paths.
//
// Headless Chromium has no hardware WebGL by default, so we force software
// WebGL (swiftshader) just for this test — otherwise the app falls back to
// MapNoWebGL and there is no maplibregl marker to inspect.
test.use({
  launchOptions: {
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

test("rider arrow stays horizontally centered and anchored toward the bottom during tracking", async ({
  page,
}) => {
  // Path of 6 positions heading east along Paris.
  await page.addInitScript(() => {
    const path = [
      { lat: 48.8566, lng: 2.3522 },
      { lat: 48.8566, lng: 2.3532 },
      { lat: 48.8566, lng: 2.3542 },
      { lat: 48.8566, lng: 2.3552 },
      { lat: 48.8566, lng: 2.3562 },
      { lat: 48.8566, lng: 2.3572 },
    ];

    const makePos = (i: number): GeolocationPosition =>
      ({
        coords: {
          latitude: path[i]!.lat,
          longitude: path[i]!.lng,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: 90,
          speed: 5,
        },
        timestamp: Date.now(),
        toJSON() {
          return this;
        },
      }) as unknown as GeolocationPosition;

    let watchId = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: (success: PositionCallback) => {
          const id = ++watchId;
          path.forEach((_, i) => {
            setTimeout(() => success(makePos(i)), 200 + i * 400);
          });
          return id;
        },
        clearWatch: () => {},
        getCurrentPosition: (success: PositionCallback) => {
          setTimeout(() => success(makePos(0)), 50);
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
  await expect(page.getByText("Interrompre")).toBeVisible({ timeout: 5000 });

  const mapContainer = page.locator('[data-testid="tracking-map"]');
  await expect(mapContainer).toBeVisible({ timeout: 5000 });

  // Give the mocked GPS updates time to drain through the throttle window
  // plus the flyTo animation (400ms).
  await page.waitForTimeout(3500);

  const mapBox = await mapContainer.boundingBox();
  expect(mapBox).not.toBeNull();

  const marker = page.locator(".maplibregl-marker").first();
  await expect(marker).toBeVisible({ timeout: 3000 });
  const markerBox = await marker.boundingBox();
  expect(markerBox).not.toBeNull();

  const mapCenterX = mapBox!.x + mapBox!.width / 2;
  const mapCenterY = mapBox!.y + mapBox!.height / 2;
  const markerCenterX = markerBox!.x + markerBox!.width / 2;
  const markerCenterY = markerBox!.y + markerBox!.height / 2;

  // Horizontal: marker must sit within 15px of the map's horizontal center.
  expect(Math.abs(markerCenterX - mapCenterX)).toBeLessThan(15);

  // Vertical: padding top=200 / bottom=0 pushes the camera anchor into the
  // lower half of the map. Marker must be strictly below geometric center.
  expect(markerCenterY).toBeGreaterThan(mapCenterY);

  // And not too close to the very bottom edge (still inside the visible area).
  expect(markerCenterY).toBeLessThan(mapBox!.y + mapBox!.height - 20);
});
