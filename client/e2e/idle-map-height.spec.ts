import { test, expect } from "@playwright/test";

test("#122 regression: idle map fills available space with no gap below buttons", async ({
  page,
  context,
}) => {
  // Grant geolocation and fake position
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });

  // Stub API
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    }),
  );

  await page.goto("/trip", { waitUntil: "networkidle" });

  // Wait for idle UI (start button visible)
  const startBtn = page.getByText("Démarrer");
  await expect(startBtn).toBeVisible({ timeout: 5000 });

  // Map must be visible
  const mapContainer = page.locator(".leaflet-container");
  await expect(mapContainer).toBeVisible({ timeout: 3000 });
  const mapBox = await mapContainer.boundingBox();
  expect(mapBox).not.toBeNull();

  // REGRESSION: Map should be significantly taller than a small fixed height.
  // With flex-1 it fills available space; the old 50vh was about 422px on 844px viewport.
  // Now it should be taller since it expands to fill space between header and buttons.
  const viewport = page.viewportSize()!;
  expect(mapBox!.height).toBeGreaterThan(viewport.height * 0.5);

  // REGRESSION: The gap between the map bottom and buttons top should be minimal
  // (just CSS padding/margin, not a large blank area)
  const buttonsContainer = startBtn.locator("..");
  const buttonsBox = await buttonsContainer.boundingBox();
  expect(buttonsBox).not.toBeNull();

  const mapBottom = mapBox!.y + mapBox!.height;
  const gapBetweenMapAndButtons = buttonsBox!.y - mapBottom;
  // With the old 50vh, there was a large gap (100px+). With flex-1, it should be small.
  expect(gapBetweenMapAndButtons).toBeLessThan(30);

  // ErrorBoundary should not appear
  const errorBoundary = page.getByText("Une erreur est survenue");
  await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });
});
