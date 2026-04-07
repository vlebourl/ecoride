import { test, expect } from "@playwright/test";

test("tracking camera keeps the rider anchored toward the bottom", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 48.8566, longitude: 2.3522 });

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

  const map = page.locator('[data-testid="tracking-map"]');
  await expect(map).toBeVisible({ timeout: 5000 });

  await expect(map).toHaveAttribute("data-camera-padding-top", "200");
  await expect(map).toHaveAttribute("data-camera-padding-bottom", "0");
});
