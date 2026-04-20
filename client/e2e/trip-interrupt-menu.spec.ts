import { test, expect } from "@playwright/test";

test("interrupt button pauses the trip and opens the interrupt menu", async ({ page, context }) => {
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

  await page.getByText("Interrompre").click();

  const menu = page.getByRole("dialog", { name: "Menu d'interruption du trajet" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprendre" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abandonner" })).toBeVisible();
  await expect(page.getByLabel("Trajet en pause")).toBeVisible();
});
