import { test, expect } from "@playwright/test";

test("clicking Démarrer starts tracking with counters", async ({ page, context }) => {
  // Grant geolocation permission and fake position
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

  // Click Démarrer
  const startBtn = page.getByText("Démarrer");
  await expect(startBtn).toBeVisible();
  await startBtn.click();

  // Should now see Terminer button (tracking mode)
  const stopBtn = page.getByText("Terminer");
  await expect(stopBtn).toBeVisible({ timeout: 5000 });

  // Should see speed display (km/h label)
  const speedLabel = page.getByText("km/h");
  await expect(speedLabel).toBeVisible({ timeout: 3000 });

  // Wait 4 seconds for timer to tick
  await page.waitForTimeout(4000);

  // Check all visible text for debugging
  const allText = await page.locator("body").textContent();
  console.log("Body text:", allText?.slice(0, 500));

  // Timer should have ticked (not 00:00)
  const timeValues = await page.locator("text=/\\d{2}:\\d{2}/").allTextContents();
  console.log("Time values found:", timeValues);
  expect(timeValues.some((t) => t !== "00:00")).toBeTruthy();
});
