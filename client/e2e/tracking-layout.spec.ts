import { test, expect } from "@playwright/test";

test("#82 regression: interrupt button anchored at bottom and map visible during tracking", async ({
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

  // Start tracking
  const startBtn = page.getByText("Démarrer");
  await expect(startBtn).toBeVisible();
  await startBtn.click();

  // Wait for tracking UI
  const interruptBtn = page.getByText("Interrompre");
  await expect(interruptBtn).toBeVisible({ timeout: 5000 });

  // REGRESSION: Tracking map area must be visible during tracking, with or without WebGL
  const mapContainer = page.locator('[data-testid="tracking-map"]');
  await expect(mapContainer).toBeVisible({ timeout: 3000 });
  const mapBox = await mapContainer.boundingBox();
  expect(mapBox).not.toBeNull();
  expect(mapBox!.height).toBeGreaterThan(50);

  // REGRESSION: Stop button must be near the bottom of the viewport
  const interruptBtnBox = await interruptBtn.boundingBox();
  expect(interruptBtnBox).not.toBeNull();
  const viewport = page.viewportSize()!;
  // Button bottom edge should be in the lower 40% of the viewport
  const buttonBottom = interruptBtnBox!.y + interruptBtnBox!.height;
  expect(buttonBottom).toBeGreaterThan(viewport.height * 0.6);

  // REGRESSION: Interrupt button must be below the map (not overlapping)
  expect(interruptBtnBox!.y).toBeGreaterThanOrEqual(mapBox!.y + mapBox!.height - 1);

  // ErrorBoundary should not appear
  const errorBoundary = page.getByText("Une erreur est survenue");
  await expect(errorBoundary).not.toBeVisible({ timeout: 3000 });
});
